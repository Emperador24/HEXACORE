import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, IsNull } from 'typeorm';
import { CONEXION_ALIMENTOS } from '../persistencia/conexion';
import { Pedido, EstadoPedido } from '../persistencia/entidades/pedido.entity';
import { DetallePedido } from '../persistencia/entidades/detalle-pedido.entity';
import { TransaccionPedido, EstadoTransaccionPedido } from '../persistencia/entidades/transaccion-pedido.entity';
import { PreparacionPedido, HistorialPreparacion, IncidenciaPreparacion } from '../persistencia/entidades/preparacion-pedido.entity';
import { OperacionPreparacionDto } from './operacion-preparacion.dto';
import { pagoAcreditado, preparacionDto } from './recepcion.service';

const conflicto = (codigo: string) => new ConflictException({ codigo, message: {
  VERSION_PREPARACION_DESACTUALIZADA: 'El pedido cambió. Actualiza la bandeja antes de continuar.',
  PEDIDO_NO_PREPARABLE: 'Solo se preparan pedidos confirmados con pago aprobado.',
  TRANSICION_PREPARACION_INVALIDA: 'Esta acción no corresponde al avance actual del pedido.',
  INCIDENCIAS_PENDIENTES: 'Resuelve las incidencias antes de marcar listo.',
  CLAVE_PREPARACION_INCOMPATIBLE: 'La clave de operación ya identifica otra petición.',
}[codigo] ?? codigo });

@Injectable()
export class PreparacionService {
  constructor(@InjectDataSource(CONEXION_ALIMENTOS) private readonly datos: DataSource) {}
  async operar(local: string, pedidoId: string, actorId: string, id: string, d: OperacionPreparacionDto) {
    local = local.toLowerCase(); pedidoId = pedidoId.toLowerCase(); actorId = actorId.toLowerCase(); id = id.toLowerCase();
    const peticion = { local, pedidoId, actorId, accion: d.accion, version: d.version,
      minutos: d.minutos, motivo: d.motivo, productoId: d.productoId?.toLowerCase(), incidenciaId: d.incidenciaId?.toLowerCase() };
    const huella = createHash('sha256').update(JSON.stringify(peticion)).digest('hex');
    try {
      return await this.datos.transaction(async m => {
        // Orden compatible con pagos: pedido primero. Nunca se cambia su estado financiero.
        const pedido = await m.findOne(Pedido, { where: { id: pedidoId, establecimientoId: local }, lock: { mode: 'pessimistic_write' } });
        if (!pedido) throw new NotFoundException('No existe el pedido en este establecimiento');
        const previa = await m.findOneBy(HistorialPreparacion, { id });
        if (previa) {
          if (previa.huella !== huella) throw conflicto('CLAVE_PREPARACION_INCOMPATIBLE');
          return previa.resultado;
        }
        const pagos = await m.find(TransaccionPedido, { where: { pedidoId, estado: EstadoTransaccionPedido.APROBADA } });
        if (pedido.estado !== EstadoPedido.CONFIRMADO || !pagoAcreditado(pedido, pagos)) throw conflicto('PEDIDO_NO_PREPARABLE');
        const avance = await m.findOneBy(PreparacionPedido, { pedidoId }) ?? m.create(PreparacionPedido,
          { pedidoId, estado: 'RECIBIDO', version: 0, iniciadoEn: null, estimadoListoEn: null, listoEn: null });
        if (avance.version !== d.version) throw conflicto('VERSION_PREPARACION_DESACTUALIZADA');
        const [{ ahora }] = await m.query('SELECT clock_timestamp() AS ahora');
        const fecha = new Date(ahora);
        const abiertas = () => m.count(IncidenciaPreparacion, { where: { pedidoId, resueltaEn: IsNull() } });
        let aviso: string;
        const campos: Record<string, string[]> = { INICIAR: ['minutos'], RETRASAR: ['minutos', 'motivo'], LISTO: [], INCIDENCIA: ['motivo', 'productoId'], RESOLVER_INCIDENCIA: ['motivo', 'incidenciaId'] };
        for (const campo of ['minutos', 'motivo', 'productoId', 'incidenciaId'] as const) {
          if (d[campo] !== undefined && !campos[d.accion].includes(campo)) throw new BadRequestException('La acción contiene datos que no le corresponden.');
        }
        if (['INICIAR', 'RETRASAR'].includes(d.accion) && d.minutos == null) throw new BadRequestException('Indica minutos entre 1 y 240.');
        if (['RETRASAR', 'INCIDENCIA', 'RESOLVER_INCIDENCIA'].includes(d.accion) && !d.motivo) throw new BadRequestException('Indica el motivo.');
        if (d.accion === 'INICIAR') {
          if (avance.estado !== 'RECIBIDO') throw conflicto('TRANSICION_PREPARACION_INVALIDA');
          avance.estado = 'EN_PREPARACION'; avance.iniciadoEn = fecha;
          avance.estimadoListoEn = new Date(fecha.getTime() + d.minutos! * 60000);
          aviso = 'Tu pedido está en preparación. Ya puedes consultar su tiempo estimado.';
        } else if (d.accion === 'RETRASAR') {
          if (avance.estado !== 'EN_PREPARACION') throw conflicto('TRANSICION_PREPARACION_INVALIDA');
          avance.estimadoListoEn = new Date(Math.max(fecha.getTime(), avance.estimadoListoEn!.getTime()) + d.minutos! * 60000);
          aviso = `La preparación tiene un retraso: ${d.motivo}. Se actualizó el tiempo estimado.`;
        } else if (d.accion === 'INCIDENCIA') {
          if (avance.estado !== 'EN_PREPARACION') throw conflicto('TRANSICION_PREPARACION_INVALIDA');
          if (peticion.productoId && !await m.exists(DetallePedido, { where: { pedidoId, productoId: peticion.productoId } })) throw new BadRequestException('El producto no pertenece al detalle del pedido.');
          await m.insert(IncidenciaPreparacion, { id, pedidoId, productoId: peticion.productoId ?? null, descripcion: d.motivo!, actorId, creadaEn: fecha,
            resueltaEn: null, resueltaPor: null, resolucion: null });
          aviso = `El establecimiento reportó una incidencia: ${d.motivo}. Debe coordinar contigo; no cambia productos, precio ni pago.`;
        } else if (d.accion === 'RESOLVER_INCIDENCIA') {
          if (avance.estado !== 'EN_PREPARACION') throw conflicto('TRANSICION_PREPARACION_INVALIDA');
          if (!peticion.incidenciaId) throw new BadRequestException('Indica la incidencia que se resolvió.');
          const incidencia = await m.findOneBy(IncidenciaPreparacion, { id: peticion.incidenciaId, pedidoId });
          if (!incidencia || incidencia.resueltaEn) throw conflicto('TRANSICION_PREPARACION_INVALIDA');
          Object.assign(incidencia, { resueltaEn: fecha, resueltaPor: actorId, resolucion: d.motivo! });
          await m.save(IncidenciaPreparacion, incidencia);
          aviso = `Incidencia resuelta para preparar lo acordado: ${d.motivo}.`;
        } else {
          if (avance.estado !== 'EN_PREPARACION') throw conflicto('TRANSICION_PREPARACION_INVALIDA');
          if (await abiertas()) throw conflicto('INCIDENCIAS_PENDIENTES');
          avance.estado = 'LISTO_PARA_ENTREGAR'; avance.listoEn = fecha;
          aviso = 'Tu pedido está listo para entregar. Consulta su punto de entrega.';
        }
        const anterior = avance.version; avance.version++;
        await m.save(PreparacionPedido, avance);
        const resultado = { id, pedidoId, accion: d.accion, creadoEn: fecha.toISOString(), preparacion: preparacionDto(avance, await abiertas()) };
        await m.insert(HistorialPreparacion, { id, pedidoId, actorId, accion: d.accion, huella,
          versionAnterior: anterior, versionNueva: avance.version, datos: peticion, resultado, aviso, creadoEn: fecha });
        return resultado;
      });
    } catch (e) {
      if ((e as { driverError?: { code?: string } }).driverError?.code === '23505') throw conflicto('CLAVE_PREPARACION_INCOMPATIBLE');
      throw e;
    }
  }
}
