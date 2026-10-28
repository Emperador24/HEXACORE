import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { Establecimiento } from '../persistencia/entidades/establecimiento.entity';
import { Pedido, EstadoPedido } from '../persistencia/entidades/pedido.entity';
import { DetallePedido } from '../persistencia/entidades/detalle-pedido.entity';

/** Proyección de lectura para el establecimiento, sin identidad del cliente ni QR. */
export class PedidoRecibidoDto {
  id: string;
  estado: EstadoPedido;
  total: string;
  moneda: string;
  confirmadoEn: string | null;
  productos: { nombreProducto: string; cantidad: number; precioUnitario: string }[];
}

@Injectable()
export class RecepcionService {
  constructor(@InjectDataSource() private readonly datos: DataSource) {}

  async listar(establecimientoId: string): Promise<PedidoRecibidoDto[]> {
    if (!await this.datos.manager.exists(Establecimiento, { where: { id: establecimientoId } })) {
      throw new NotFoundException('No existe el establecimiento');
    }
    const pedidos = await this.datos.manager.find(Pedido, {
      where: { establecimientoId, estado: EstadoPedido.CONFIRMADO },
      order: { confirmadoEn: 'DESC', id: 'ASC' },
    });
    if (!pedidos.length) return [];
    const detalles = await this.datos.manager.find(DetallePedido, {
      where: { pedidoId: In(pedidos.map((p) => p.id)) }, order: { id: 'ASC' },
    });
    return pedidos.map((pedido) => ({
      id: pedido.id, estado: pedido.estado, total: pedido.total, moneda: pedido.moneda,
      confirmadoEn: pedido.confirmadoEn?.toISOString() ?? null,
      productos: detalles.filter((d) => d.pedidoId === pedido.id).map((d) => ({
        nombreProducto: d.nombreProducto, cantidad: d.cantidad, precioUnitario: d.precioUnitario,
      })),
    }));
  }
}
