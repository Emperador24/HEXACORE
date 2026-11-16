import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, EntityManager, FindOptionsWhere, In, IsNull, MoreThan } from 'typeorm';
import { ConsultaPersonal } from '../../identidad/consulta-personal.module';
import { CONEXION_ALIMENTOS } from '../persistencia/conexion';
import { Pedido, EstadoPedido } from '../persistencia/entidades/pedido.entity';
import { Establecimiento } from '../persistencia/entidades/establecimiento.entity';
import { PersonalEstablecimiento } from '../persistencia/entidades/personal-establecimiento.entity';
import { TransaccionPedido, EstadoTransaccionPedido } from '../persistencia/entidades/transaccion-pedido.entity';
import { DetallePedido } from '../persistencia/entidades/detalle-pedido.entity';
import { PreparacionPedido, HistorialPreparacion, IncidenciaPreparacion } from '../persistencia/entidades/preparacion-pedido.entity';
import { EntregaPedido } from '../persistencia/entidades/entrega-pedido.entity';
import { CancelacionPedido, cancelacionDto, EstadoReembolsoPedido } from '../persistencia/entidades/cancelacion-pedido.entity';
import { OperacionInventario } from '../persistencia/entidades/operacion-inventario.entity';
import { ReservaInventario, EstadoReservaInventario } from '../persistencia/entidades/reserva-inventario.entity';
import { AjustesInventarioService } from '../inventario/ajustes-inventario.service';
import { ReservasService } from '../inventario/reservas.service';
import { pagoAcreditado } from './recepcion.service';
import { CancelarPedidoDto } from './cancelacion.dto';
import { ClienteReembolsos } from './cliente-reembolsos.service';

const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const conflicto = (codigo: string, message: string) => new ConflictException({ codigo, message });

/** Cancelación SQL definitiva; dinero e inventario tienen seguimiento independiente. */
@Injectable()
export class CancelacionService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CancelacionService.name);
  private temporizador?: ReturnType<typeof setInterval>;
  private ciclo?: Promise<void>;
  private cursor?: string;
  private readonly trabajos = new Map<string, Promise<void>>();
  constructor(@InjectDataSource(CONEXION_ALIMENTOS) private readonly datos: DataSource,
    private readonly cuentas: ConsultaPersonal, private readonly finanzas: ClienteReembolsos,
    private readonly ajustes: AjustesInventarioService, private readonly reservas: ReservasService) {}

  onModuleInit() {
    this.temporizador = setInterval(() => { void this.recuperarPendientes(); }, 5000);
    this.temporizador.unref(); void this.recuperarPendientes();
  }
  async onModuleDestroy() {
    clearInterval(this.temporizador); await this.ciclo;
    await Promise.allSettled([...this.trabajos.values()]);
  }
  private async autorizar(m: EntityManager, local: string, actor: string, escribir = false) {
    if (!await this.cuentas.bloquearPersonalActivo(actor, m)) throw new ForbiddenException('Tu cuenta Personal no está activa.');
    if (!await m.findOne(PersonalEstablecimiento, { where: { establecimientoId: local, usuarioId: actor }, lock: { mode: 'pessimistic_read' } })) {
      throw new ForbiddenException('Tu cuenta no está vinculada a este establecimiento.');
    }
    if (!await m.findOne(Establecimiento, { where: { id: local }, lock: { mode: escribir ? 'pessimistic_write' : 'pessimistic_read' } })) throw new NotFoundException('No existe el establecimiento');
  }

  async cancelar(local: string, pedidoId: string, actor: string, id: string, dto: CancelarPedidoDto) {
    local = local.toLowerCase(); pedidoId = pedidoId.toLowerCase(); actor = actor.toLowerCase(); id = id.toLowerCase();
    const motivo = typeof dto.motivo === 'string' ? dto.motivo.trim() : '';
    if (dto.confirmar !== true || motivo.length < 3 || motivo.length > 200 || !Number.isInteger(dto.version) || dto.version < 0) {
      throw new BadRequestException('Indica motivo, versión y confirmación explícita de la cancelación.');
    }
    const peticion = { accion: 'CANCELAR', local, pedidoId, actor, version: dto.version, motivo, confirmar: true };
    const huella = sha(peticion);
    try {
      await this.datos.transaction(async m => {
        // Compatible con entrega: cuenta → vínculo → establecimiento → pedido.
        // El exclusivo del establecimiento serializa las intenciones de inventario.
        await this.autorizar(m, local, actor, true);
        const pedido = await m.findOne(Pedido, { where: { id: pedidoId, establecimientoId: local }, lock: { mode: 'pessimistic_write' } });
        if (!pedido) throw new NotFoundException('No existe el pedido en este establecimiento');
        const previa = await m.findOneBy(HistorialPreparacion, { id });
        if (previa) {
          if (previa.accion !== 'CANCELAR' || previa.huella !== huella) throw conflicto('CLAVE_CANCELACION_INCOMPATIBLE', 'La operación corresponde a otra petición.');
          return;
        }
        if (await m.exists(EntregaPedido, { where: { pedidoId } })) throw conflicto('PEDIDO_YA_ENTREGADO', 'No se puede cancelar un pedido entregado.');
        if (pedido.estado === EstadoPedido.CANCELADO) throw conflicto('PEDIDO_YA_CANCELADO', 'El pedido ya tiene una cancelación. Consulta su resultado.');
        const pagos = await m.find(TransaccionPedido, { where: { pedidoId, estado: EstadoTransaccionPedido.APROBADA } });
        if (pedido.estado !== EstadoPedido.CONFIRMADO || !pagoAcreditado(pedido, pagos) || !pagos[0]?.referenciaPasarela) {
          throw conflicto('PEDIDO_NO_CANCELABLE', 'Se requiere un pedido confirmado y un cobro aprobado con referencia. Los pagos inciertos requieren resolución F12.');
        }
        const avance = await m.findOneBy(PreparacionPedido, { pedidoId }) ?? m.create(PreparacionPedido,
          { pedidoId, estado: 'RECIBIDO', version: 0, iniciadoEn: null, estimadoListoEn: null, listoEn: null });
        if (avance.version !== dto.version) throw conflicto('VERSION_PREPARACION_DESACTUALIZADA', 'El pedido cambió. Actualiza y revisa su estado antes de cancelar.');
        const reserva = await m.findOne(ReservaInventario, { where: { pedidoId }, lock: { mode: 'pessimistic_write' } });
        const detalles = await m.find(DetallePedido, { where: { pedidoId }, order: { productoId: 'ASC' } });
        const iniciada = avance.estado !== 'RECIBIDO' || !!avance.iniciadoEn;
        const ambigua = !!avance.estimadoListoEn || !!avance.listoEn ||
          await m.exists(HistorialPreparacion, { where: { pedidoId, accion: In(['INICIAR', 'LISTO', 'INCIDENCIA', 'RESOLVER_INCIDENCIA', 'ENTREGAR']) } }) ||
          await m.exists(IncidenciaPreparacion, { where: { pedidoId } });
        const reservaConsumida = !!reserva && [EstadoReservaInventario.CONSUMIDA, EstadoReservaInventario.CONSUMO_PENDIENTE].includes(reserva.estado);
        const detalleValido = detalles.length > 0 && detalles.every(d => Number.isSafeInteger(d.cantidad) && d.cantidad > 0) && new Set(detalles.map(d => d.productoId)).size === detalles.length;
        const politica = iniciada ? 'NO_REINCORPORAR' : ambigua || !reservaConsumida || !detalleValido ? 'REVISION' : 'RESTITUIR_SIN_PREPARAR';
        const [{ ahora }] = await m.query('SELECT clock_timestamp() AS ahora'); const fecha = new Date(ahora);
        const op = m.create(CancelacionPedido, { pedidoId, operacionId: id, establecimientoId: local, actorId: actor,
          motivo, canceladoEn: fecha, huella, cobroId: pagos[0].id, referenciaCobro: pagos[0].referenciaPasarela!,
          monto: pagos[0].monto, moneda: pagos[0].moneda, reembolsoId: randomUUID(), estadoReembolso: 'PENDIENTE',
          intentadoEn: null, resueltoEn: null, referenciaReembolso: null, politicaInventario: politica,
          estadoInventario: politica === 'RESTITUIR_SIN_PREPARAR' ? 'PENDIENTE' : politica, operacionesInventario: [] });
        const anterior = avance.version; avance.version++;
        await m.save(PreparacionPedido, avance);
        if (politica === 'RESTITUIR_SIN_PREPARAR') {
          // El físico ya fue descontado al pagar: esto es restitución, no liberación
          // de una reserva ACTIVA. Lua CU-012 y WAITAOF aplican cada delta una vez.
          for (const detalle of detalles) {
            const operacion = randomUUID();
            const datos = { tipo: 'RESTITUCION_CU011F', cancelacionId: id, pedidoId, cobroId: pagos[0].id,
              productoId: detalle.productoId, delta: detalle.cantidad };
            await m.insert(OperacionInventario, { id: operacion, establecimientoId: local, productoId: detalle.productoId,
              actorId: actor, tipo: 'AJUSTE', delta: detalle.cantidad, motivo: `Cancelación sin preparar: ${motivo}`,
              huella: sha(datos), peticion: datos, inicializa: false, estado: 'PENDIENTE' });
            op.operacionesInventario.push(operacion);
          }
        }
        await m.insert(HistorialPreparacion, { id, pedidoId, actorId: actor, accion: 'CANCELAR', huella,
          versionAnterior: anterior, versionNueva: avance.version, datos: peticion,
          resultado: cancelacionDto(op), aviso: `El establecimiento canceló tu pedido: ${motivo}. El reembolso se encuentra pendiente de confirmación.`, creadoEn: fecha });
        await m.insert(CancelacionPedido, op);
        await m.update(Pedido, { id: pedidoId }, { estado: EstadoPedido.CANCELADO, motivoCancelacion: motivo, canceladoEn: fecha });
      });
    } catch (e) {
      if ((e as { driverError?: { code?: string } }).driverError?.code === '23505') throw conflicto('CLAVE_CANCELACION_INCOMPATIBLE', 'La operación ya corresponde a otra petición.');
      throw e;
    }
    void this.procesar(pedidoId);
    return this.consultar(local, pedidoId, actor, false);
  }

  async consultar(local: string, pedidoId: string, actor: string, actualizar = true) {
    local = local.toLowerCase(); pedidoId = pedidoId.toLowerCase(); actor = actor.toLowerCase();
    const op = await this.datos.transaction(async m => {
      await this.autorizar(m, local, actor);
      const c = await m.findOneBy(CancelacionPedido, { pedidoId, establecimientoId: local });
      if (!c) throw new NotFoundException('No existe una cancelación en este establecimiento para ese pedido.');
      return c;
    });
    if (actualizar) { await this.procesar(pedidoId); return cancelacionDto(await this.datos.manager.findOneByOrFail(CancelacionPedido, { pedidoId })); }
    return cancelacionDto(op);
  }

  recuperarPendientes(): Promise<void> {
    this.ciclo ??= (async () => {
      const pendientes: FindOptionsWhere<CancelacionPedido>[] = [{ estadoReembolso: In(['PENDIENTE', 'INCIERTO']) }, { estadoInventario: 'PENDIENTE' }];
      const where = pendientes.map(w =>
        ({ ...w, ...(this.cursor ? { pedidoId: MoreThan(this.cursor) } : {}) }));
      const ops = await this.datos.manager.find(CancelacionPedido, { where, order: { pedidoId: 'ASC' }, take: 50 });
      this.cursor = ops.at(-1)?.pedidoId;
      for (const op of ops) await this.procesar(op.pedidoId);
    })().catch(() => this.log.warn('CANCELACIONES_SEGUIMIENTO_PENDIENTE')).finally(() => { this.ciclo = undefined; });
    return this.ciclo;
  }
  procesar(pedidoId: string): Promise<void> {
    const previo = this.trabajos.get(pedidoId); if (previo) return previo;
    const trabajo = this.procesarUna(pedidoId).catch(() => this.log.warn('CANCELACION_SEGUIMIENTO_PENDIENTE'))
      .finally(() => { this.trabajos.delete(pedidoId); });
    this.trabajos.set(pedidoId, trabajo); return trabajo;
  }
  private async procesarUna(pedidoId: string) {
    let op = await this.datos.manager.findOneBy(CancelacionPedido, { pedidoId }); if (!op) return;
    if (op.estadoInventario === 'PENDIENTE') {
      try {
        const reserva = await this.datos.manager.findOneBy(ReservaInventario, { pedidoId });
        if (reserva?.estado === EstadoReservaInventario.CONSUMO_PENDIENTE) {
          const r = await this.reservas.consumir(op.establecimientoId, pedidoId);
          if (r.estado !== 'CONSUMIDA') throw new Error('CONSUMO_NO_CONFIRMADO');
          await this.datos.manager.update(ReservaInventario, { pedidoId, estado: EstadoReservaInventario.CONSUMO_PENDIENTE }, { estado: EstadoReservaInventario.CONSUMIDA });
        }
        await this.ajustes.recuperarEstablecimiento(op.establecimientoId);
        const ops = await this.datos.manager.find(OperacionInventario, { where: { id: In(op.operacionesInventario) } });
        const estado = ops.length !== op.operacionesInventario.length || !ops.length ? 'REVISION' :
          ops.some(o => o.estado === 'RECHAZADA') ? 'REVISION' : ops.every(o => o.estado === 'APLICADA') ? 'RESTITUIDO' : 'PENDIENTE';
        if (estado !== 'PENDIENTE') await this.datos.manager.update(CancelacionPedido, { pedidoId }, { estadoInventario: estado });
      } catch { this.log.warn('CANCELACION_INVENTARIO_PENDIENTE'); }
    }
    // Claim SQL corto y durable ANTES de HTTP. La marca de intento impide
    // reenviar, incluso si el proceso muere antes de recibir/guardar respuesta.
    // El simulador pierde su idempotencia al reiniciar: no es seguro reenviar.
    const claim = await this.datos.manager.update(CancelacionPedido,
      { pedidoId, estadoReembolso: 'PENDIENTE', intentadoEn: IsNull() }, { intentadoEn: new Date() });
    op = await this.datos.manager.findOneByOrFail(CancelacionPedido, { pedidoId });
    try {
      const evidencia = claim.affected === 1 ? await this.finanzas.solicitar(op) : await this.finanzas.consultar(op);
      // Leer el libro nunca reenvía al proveedor. Un libro ausente no prueba rechazo.
      const estado = evidencia?.resultado === 'APROBADO' && evidencia.referencia ? 'APROBADO' :
        evidencia?.resultado === 'RECHAZADO' ? 'RECHAZADO' : 'INCIERTO';
      await this.guardarResultado(pedidoId, estado, evidencia?.referencia ?? null);
    } catch { await this.guardarResultado(pedidoId, 'INCIERTO', null); }
  }
  private async guardarResultado(pedidoId: string, estado: EstadoReembolsoPedido, referencia: string | null) {
    await this.datos.transaction(async m => {
      await m.findOneOrFail(Pedido, { where: { id: pedidoId }, lock: { mode: 'pessimistic_write' } });
      const c = await m.findOneOrFail(CancelacionPedido, { where: { pedidoId }, lock: { mode: 'pessimistic_write' } });
      // Un fallo de lectura no rebaja evidencia terminal confirmada previamente.
      if (estado === 'INCIERTO' && ['APROBADO', 'RECHAZADO'].includes(c.estadoReembolso)) return;
      if (c.estadoReembolso === estado && c.referenciaReembolso === referencia) return;
      const [{ ahora }] = await m.query('SELECT clock_timestamp() AS ahora'); const fecha = new Date(ahora);
      Object.assign(c, { estadoReembolso: estado, referenciaReembolso: referencia,
        resueltoEn: ['APROBADO', 'RECHAZADO'].includes(estado) ? fecha : null });
      const avance = await m.findOneByOrFail(PreparacionPedido, { pedidoId }); const anterior = avance.version; avance.version++;
      await m.save(PreparacionPedido, avance); await m.save(CancelacionPedido, c);
      const aviso = estado === 'APROBADO' ? 'La pasarela confirmó la aprobación del reembolso total de tu pedido cancelado.' :
        estado === 'RECHAZADO' ? 'El reembolso fue rechazado. El pedido sigue cancelado; contacta al establecimiento.' :
          'El resultado del reembolso es incierto. No afirmamos que el dinero haya sido devuelto; requiere seguimiento.';
      await m.insert(HistorialPreparacion, { id: randomUUID(), pedidoId, actorId: c.actorId, accion: 'REEMBOLSO',
        huella: sha({ pedidoId, estado, referencia }), versionAnterior: anterior, versionNueva: avance.version,
        datos: { estado }, resultado: cancelacionDto(c), aviso, creadoEn: fecha });
    });
  }
}
