import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { CONEXION_ALIMENTOS } from '../persistencia/conexion';
import { Establecimiento } from '../persistencia/entidades/establecimiento.entity';
import { Pedido, EstadoPedido } from '../persistencia/entidades/pedido.entity';
import { DetallePedido } from '../persistencia/entidades/detalle-pedido.entity';
import { TransaccionPedido, EstadoTransaccionPedido } from '../persistencia/entidades/transaccion-pedido.entity';
import { HistorialPreparacion, IncidenciaPreparacion, PreparacionPedido } from '../persistencia/entidades/preparacion-pedido.entity';

export function preparacionDto(p?: PreparacionPedido, abiertas = 0) {
  return { estado: p?.estado ?? 'RECIBIDO', version: p?.version ?? 0,
    iniciadoEn: p?.iniciadoEn?.toISOString() ?? null, estimadoListoEn: p?.estimadoListoEn?.toISOString() ?? null,
    listoEn: p?.listoEn?.toISOString() ?? null, incidenciasAbiertas: abiertas,
    retrasado: p?.estado === 'EN_PREPARACION' && !!p.estimadoListoEn && p.estimadoListoEn.getTime() < Date.now() };
}
export class PedidoRecibidoDto {
  id: string; estado: EstadoPedido; total: string; moneda: string; confirmadoEn: string | null;
  pagoVerificado: boolean; preparacion: ReturnType<typeof preparacionDto>;
  productos: { nombreProducto: string; cantidad: number; precioUnitario: string }[];
}
export function pagoAcreditado(p: Pedido, pagos: TransaccionPedido[]) {
  const aprobados = pagos.filter(t => t.pedidoId === p.id && t.estado === EstadoTransaccionPedido.APROBADA);
  return aprobados.length === 1 && aprobados[0].monto === p.total && aprobados[0].moneda === p.moneda;
}

/** Lecturas SQL acotadas. No depende de que RabbitMQ haya entregado una confirmación. */
@Injectable()
export class RecepcionService {
  constructor(@InjectDataSource(CONEXION_ALIMENTOS) private readonly datos: DataSource) {}
  private desplazamiento(pagina: number) {
    if (!Number.isSafeInteger(pagina) || pagina < 0 || !Number.isSafeInteger(pagina * 100)) throw new BadRequestException('Indica una página válida desde cero.');
    return pagina * 100;
  }
  async listar(establecimientoId: string, pagina = 0): Promise<PedidoRecibidoDto[]> {
    const skip = this.desplazamiento(pagina);
    if (!await this.datos.manager.exists(Establecimiento, { where: { id: establecimientoId } })) throw new NotFoundException('No existe el establecimiento');
    return this.datos.transaction('REPEATABLE READ', async m => {
      const pedidos = await m.find(Pedido, { where: { establecimientoId, estado: In([EstadoPedido.CONFIRMADO, EstadoPedido.CANCELADO]) },
        order: { confirmadoEn: 'DESC', id: 'ASC' }, take: 100, skip });
      return this.proyectar(m, pedidos, false);
    });
  }
  async detallePersonal(establecimientoId: string, id: string) {
    return this.datos.transaction('REPEATABLE READ', async m => {
      const pedido = await m.findOneBy(Pedido, { id, establecimientoId });
      if (!pedido) throw new NotFoundException('No existe el pedido en este establecimiento');
      return (await this.proyectar(m, [pedido], false, true))[0];
    });
  }
  async listarCliente(clienteId: string, pagina = 0) {
    const skip = this.desplazamiento(pagina);
    return this.datos.transaction('REPEATABLE READ', async m => {
      const pedidos = await m.find(Pedido, { where: { clienteId }, order: { creadoEn: 'DESC', id: 'DESC' }, take: 100, skip });
      return this.proyectar(m, pedidos, true);
    });
  }
  async detalleCliente(clienteId: string, id: string) {
    return this.datos.transaction('REPEATABLE READ', async m => {
      const pedido = await m.findOneBy(Pedido, { id, clienteId });
      if (!pedido) throw new NotFoundException('No existe el pedido en tu cuenta');
      return (await this.proyectar(m, [pedido], true, true))[0];
    });
  }
  private async proyectar(m: EntityManager, pedidos: Pedido[], cliente: boolean, detalle = false) {
    if (!pedidos.length) return [];
    const ids = pedidos.map(p => p.id);
    const detalles = await m.find(DetallePedido, { where: { pedidoId: In(ids) }, order: { id: 'ASC' } });
    const avances = await m.find(PreparacionPedido, { where: { pedidoId: In(ids) } });
    const pagos = await m.find(TransaccionPedido, { where: { pedidoId: In(ids), estado: EstadoTransaccionPedido.APROBADA } });
    const incidencias = await m.find(IncidenciaPreparacion, { where: { pedidoId: In(ids) }, order: { creadaEn: 'ASC' } });
    const historial = detalle ? await m.find(HistorialPreparacion, { where: { pedidoId: In(ids) }, order: { versionNueva: 'DESC' }, take: 100 }) : [];
    const locales = cliente ? await m.find(Establecimiento, { where: { id: In([...new Set(pedidos.map(p => p.establecimientoId))]) } }) : [];
    return pedidos.map(p => {
      const propias = incidencias.filter(i => i.pedidoId === p.id);
      const pagoVerificado = pagoAcreditado(p, pagos);
      const local = locales.find(e => e.id === p.establecimientoId);
      return { id: p.id, estado: p.estado, total: p.total, moneda: p.moneda, confirmadoEn: p.confirmadoEn?.toISOString() ?? null,
        pagoVerificado, preparacion: preparacionDto(avances.find(a => a.pedidoId === p.id), propias.filter(i => !i.resueltaEn).length),
        productos: detalles.filter(d => d.pedidoId === p.id).map(d => ({ productoId: d.productoId, nombreProducto: d.nombreProducto,
          cantidad: d.cantidad, precioUnitario: d.precioUnitario, descripcionProducto: d.descripcionProducto,
          restriccionesAlimentarias: d.restriccionesAlimentarias ?? [] })),
        ...(detalle ? { incidencias: propias.map(i => ({ id: i.id, productoId: i.productoId, descripcion: i.descripcion,
          creadaEn: i.creadaEn.toISOString(), resueltaEn: i.resueltaEn?.toISOString() ?? null, resolucion: i.resolucion })),
          avisos: historial.map(h => ({ id: h.id, accion: h.accion, mensaje: h.aviso, creadoEn: h.creadoEn.toISOString() })),
          ...(!cliente ? { historial: historial.map(h => ({ id: h.id, actorId: h.actorId, accion: h.accion, versionAnterior: h.versionAnterior,
            versionNueva: h.versionNueva, datos: h.datos, creadoEn: h.creadoEn.toISOString() })) } : {}) } : {}),
        ...(cliente ? { establecimientoId: p.establecimientoId, establecimiento: local?.nombre ?? '', puntoEntrega: local?.puntoEntrega ?? '',
          creadoEn: p.creadoEn.toISOString(), metodoEntrega: p.metodoEntrega,
          codigoQr: p.estado === EstadoPedido.CONFIRMADO && pagoVerificado ? p.codigoQr : null } : {}),
      };
    });
  }
}
