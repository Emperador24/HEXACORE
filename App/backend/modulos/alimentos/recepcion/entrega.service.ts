import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { ConsultaPersonal } from '../../identidad/consulta-personal.module';
import { CONEXION_ALIMENTOS } from '../persistencia/conexion';
import { Pedido, EstadoPedido } from '../persistencia/entidades/pedido.entity';
import { Establecimiento } from '../persistencia/entidades/establecimiento.entity';
import { PersonalEstablecimiento } from '../persistencia/entidades/personal-establecimiento.entity';
import { TransaccionPedido, EstadoTransaccionPedido } from '../persistencia/entidades/transaccion-pedido.entity';
import { DetallePedido } from '../persistencia/entidades/detalle-pedido.entity';
import { PreparacionPedido, HistorialPreparacion, IncidenciaPreparacion } from '../persistencia/entidades/preparacion-pedido.entity';
import { EntregaPedido, entregaDto } from '../persistencia/entidades/entrega-pedido.entity';
import { ConfirmarEntregaDto } from './entrega.dto';
import { pagoAcreditado, preparacionDto } from './recepcion.service';

const sha = (valor: string) => createHash('sha256').update(valor).digest('hex');
export const revisionPunto = (id: string, punto: string) => sha(`${id}\0${punto}`);
const rechazar = (codigo: string, message: string) => new ConflictException({ codigo, message });

@Injectable()
export class EntregaService {
  // Solo acelera la identificación; estado/permiso/pago siempre se releen en SQL.
  private readonly cache = new Map<string, { pedidoId: string; estado: 'VALIDADO' | 'ENTREGADO'; hasta: number }>();
  constructor(@InjectDataSource(CONEXION_ALIMENTOS) private readonly datos: DataSource, private readonly cuentas: ConsultaPersonal) {}

  private recordar(local: string, huella: string, pedidoId: string, estado: 'VALIDADO' | 'ENTREGADO') {
    const clave = `${local}:${huella}`;
    this.cache.delete(clave);
    if (this.cache.size >= 1000) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(clave, { pedidoId, estado, hasta: Date.now() + 30000 });
  }
  private async autorizar(m: EntityManager, local: string, actor: string) {
    if (!await this.cuentas.bloquearPersonalActivo(actor, m)) throw new ForbiddenException('Tu cuenta Personal no está activa.');
    const vinculo = await m.findOne(PersonalEstablecimiento, { where: { establecimientoId: local, usuarioId: actor }, lock: { mode: 'pessimistic_read' } });
    if (!vinculo) throw new ForbiddenException('Tu cuenta no está vinculada a este establecimiento.');
    const establecimiento = await m.findOne(Establecimiento, { where: { id: local }, lock: { mode: 'pessimistic_read' } });
    if (!establecimiento) throw new NotFoundException('No existe el establecimiento');
    return establecimiento;
  }
  private async comprobar(m: EntityManager, pedido: Pedido) {
    if (await m.exists(EntregaPedido, { where: { pedidoId: pedido.id } })) throw rechazar('PEDIDO_YA_ENTREGADO', 'Este pedido ya fue entregado. No se autoriza otra entrega.');
    const pagos = await m.find(TransaccionPedido, { where: { pedidoId: pedido.id, estado: EstadoTransaccionPedido.APROBADA } });
    if (pedido.estado === EstadoPedido.CANCELADO) throw rechazar('PEDIDO_CANCELADO', 'El pedido está cancelado. No se autoriza su entrega.');
    if (pedido.estado !== EstadoPedido.CONFIRMADO || !pagoAcreditado(pedido, pagos)) throw rechazar('PEDIDO_NO_PAGADO', 'El pedido requiere confirmación y un pago aprobado persistido.');
    const avance = await m.findOneBy(PreparacionPedido, { pedidoId: pedido.id });
    if (!avance || avance.estado !== 'LISTO_PARA_ENTREGAR') throw rechazar('PEDIDO_NO_LISTO', 'El pedido todavía no está listo para entregar.');
    if (await m.count(IncidenciaPreparacion, { where: { pedidoId: pedido.id, resueltaEn: IsNull() } })) throw rechazar('INCIDENCIAS_PENDIENTES', 'Resuelve las incidencias antes de entregar.');
    return avance;
  }
  async prevalidar(local: string, actor: string, codigoQr: string) {
    local = local.toLowerCase(); actor = actor.toLowerCase();
    const huella = sha(codigoQr);
    const clave = `${local}:${huella}`, anterior = this.cache.get(clave);
    if (anterior && anterior.hasta <= Date.now()) this.cache.delete(clave);
    const resultado = await this.datos.transaction(async m => {
      const establecimiento = await this.autorizar(m, local, actor);
      const pista = this.cache.get(clave);
      const pedido = pista
        ? await m.findOne(Pedido, { where: { id: pista.pedidoId, establecimientoId: local }, lock: { mode: 'pessimistic_read' } })
        : await m.createQueryBuilder(Pedido, 'pedido').where('pedido.establecimiento_id=:local', { local })
          .andWhere("pedido.codigo_qr IS NOT NULL AND encode(extensiones.digest(pedido.codigo_qr,'sha256'),'hex')=:huella", { huella })
          .setLock('pessimistic_read').getOne();
      if (!pedido || !pedido.codigoQr || sha(pedido.codigoQr) !== huella) throw new NotFoundException({ codigo: 'QR_NO_VALIDO_EN_PUNTO', message: 'El código no corresponde a un pedido de este punto de entrega.' });
      const avance = await this.comprobar(m, pedido);
      const detalles = await m.find(DetallePedido, { where: { pedidoId: pedido.id }, order: { id: 'ASC' } });
      return { pedidoId: pedido.id, version: avance.version, puntoRevision: revisionPunto(local, establecimiento.puntoEntrega),
        puntoEntrega: establecimiento.puntoEntrega, total: pedido.total, moneda: pedido.moneda,
        productos: detalles.map(d => ({ nombreProducto: d.nombreProducto, cantidad: d.cantidad, precioUnitario: d.precioUnitario })),
        preparacion: preparacionDto(avance, 0) };
    });
    this.recordar(local, huella, resultado.pedidoId, 'VALIDADO');
    return resultado;
  }
  async confirmar(local: string, actor: string, id: string, d: ConfirmarEntregaDto) {
    local = local.toLowerCase(); actor = actor.toLowerCase(); id = id.toLowerCase();
    const pedidoId = d.pedidoId.toLowerCase();
    try {
      const resultado = await this.datos.transaction(async m => {
        const establecimiento = await this.autorizar(m, local, actor);
        const pedido = await m.findOne(Pedido, { where: { id: pedidoId, establecimientoId: local }, lock: { mode: 'pessimistic_write' } });
        if (!pedido) throw new NotFoundException('No existe el pedido en este establecimiento');
        const previa = await m.findOneBy(HistorialPreparacion, { id });
        const previaHuella = (previa?.datos as { qrHuella?: string } | undefined)?.qrHuella;
        const qrHuella = d.codigoQr === undefined ? previaHuella : sha(d.codigoQr);
        const peticion = { accion: 'ENTREGAR', local, pedidoId, actorId: actor, version: d.version, puntoRevision: d.puntoRevision, qrHuella };
        const huella = sha(JSON.stringify(peticion));
        if (previa) {
          if (previa.accion !== 'ENTREGAR' || previa.huella !== huella) throw rechazar('CLAVE_ENTREGA_INCOMPATIBLE', 'La clave de operación corresponde a otra petición.');
          return previa.resultado;
        }
        // Recuperar sin QR nunca puede crear una entrega nueva.
        if (d.codigoQr === undefined) throw new BadRequestException({ codigo: 'QR_REQUERIDO', message: 'No hay una entrega confirmada con esa operación. Presenta de nuevo el código completo para continuar con el mismo identificador.' });
        if (!pedido.codigoQr || sha(pedido.codigoQr) !== qrHuella) throw new NotFoundException({ codigo: 'QR_NO_VALIDO_EN_PUNTO', message: 'El código no corresponde al pedido de este punto de entrega.' });
        const avance = await this.comprobar(m, pedido);
        if (avance.version !== d.version) throw rechazar('VERSION_PREPARACION_DESACTUALIZADA', 'El pedido cambió. Valida el código otra vez antes de entregar.');
        if (revisionPunto(local, establecimiento.puntoEntrega) !== d.puntoRevision) throw rechazar('PUNTO_ENTREGA_CAMBIO', 'El punto de entrega cambió. Valida de nuevo y revisa el punto actual.');
        const [{ ahora }] = await m.query('SELECT clock_timestamp() AS ahora');
        const fecha = new Date(ahora);
        const entrega = m.create(EntregaPedido, { pedidoId, operacionId: id, establecimientoId: local, actorId: actor,
          puntoEntrega: establecimiento.puntoEntrega, entregadoEn: fecha, qrHuella: qrHuella! });
        const anterior = avance.version; avance.version++;
        await m.save(PreparacionPedido, avance);
        const respuesta = { id, pedidoId, accion: 'ENTREGAR', creadoEn: fecha.toISOString(), estadoOperativo: 'ENTREGADO', qrUtilizable: false,
          preparacion: preparacionDto(avance, 0), entrega: entregaDto(entrega) };
        await m.insert(HistorialPreparacion, { id, pedidoId, actorId: actor, accion: 'ENTREGAR', huella,
          versionAnterior: anterior, versionNueva: avance.version, datos: { ...peticion, puntoEntrega: establecimiento.puntoEntrega },
          resultado: respuesta, aviso: `Tu pedido fue entregado en ${establecimiento.puntoEntrega}.`, creadoEn: fecha });
        await m.insert(EntregaPedido, entrega);
        return respuesta;
      });
      if (d.codigoQr) this.recordar(local, sha(d.codigoQr), pedidoId, 'ENTREGADO');
      return resultado;
    } catch (e) {
      if ((e as { driverError?: { code?: string } }).driverError?.code === '23505') throw rechazar('CLAVE_ENTREGA_INCOMPATIBLE', 'La operación ya corresponde a otra entrega.');
      throw e;
    }
  }
}
