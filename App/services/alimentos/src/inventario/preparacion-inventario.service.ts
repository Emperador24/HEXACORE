import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import Redis from 'ioredis';
import { DataSource, In, Not } from 'typeorm';
import { Establecimiento } from '../persistencia/entidades/establecimiento.entity';
import { Producto } from '../persistencia/entidades/producto.entity';
import { EstadoPedido, Pedido } from '../persistencia/entidades/pedido.entity';
import { EstadoReservaInventario, ReservaInventario } from '../persistencia/entidades/reserva-inventario.entity';
import { EstadoTransaccionPedido, TransaccionPedido } from '../persistencia/entidades/transaccion-pedido.entity';
import { REDIS_INVENTARIO } from './redis-inventario.provider';
import { clavesReserva } from './reservas.service';
import { PREPARAR_INVENTARIO_LUA } from './preparacion.scripts';

@Injectable()
export class PreparacionInventarioService {
  constructor(@InjectDataSource() private readonly datos: DataSource, @Inject(REDIS_INVENTARIO) private readonly redis: Redis) {}

  /** Operación de mantenimiento: detener compras y cambios de stock en TODAS las instancias.
   * No es una sincronización, ni reconstruye reservas. No llamar desde checkout/arranque.
   * La lectura consistente PostgreSQL no constituye una transacción distribuida con Redis.
   */
  async preparar(establecimientoId: string): Promise<{ establecimientoId: string; productosPreparados: number }> {
    if (typeof establecimientoId !== 'string' || !isUUID(establecimientoId)) throw new BadRequestException({ codigo: 'UUID_INVALIDO' });
    establecimientoId = establecimientoId.toLowerCase();
    const productos = await this.datos.transaction('REPEATABLE READ', async (gestor) => {
      if (!await gestor.exists(Establecimiento, { where: { id: establecimientoId } })) {
        throw new NotFoundException({ codigo: 'ESTABLECIMIENTO_NO_ENCONTRADO' });
      }
      const reservaPendiente = await gestor.exists(ReservaInventario, { where: {
        pedido: { establecimientoId },
        estado: Not(In([EstadoReservaInventario.LIBERADA, EstadoReservaInventario.CONSUMIDA])),
      } });
      // Incluso si expiraEn ya pasó: la preparación no cancela ni resuelve operaciones pendientes.
      const pedidoPendiente = await gestor.exists(Pedido, { where: { establecimientoId, estado: EstadoPedido.PENDIENTE_PAGO } });
      const pagoPendiente = await gestor.exists(TransaccionPedido, { where: [
        { pedido: { establecimientoId }, estado: In([EstadoTransaccionPedido.PENDIENTE, EstadoTransaccionPedido.FALLIDA]) },
        { pedido: { establecimientoId, estado: Not(EstadoPedido.CONFIRMADO) }, estado: EstadoTransaccionPedido.APROBADA },
      ] });
      if (reservaPendiente || pedidoPendiente || pagoPendiente) {
        throw new ConflictException({ codigo: 'COMPROMISOS_INVENTARIO_PENDIENTES' });
      }
      // Sin filtro activo: incluye todo el catálogo, también productos con stock cero.
      const filas = await gestor.find(Producto, {
        where: { establecimientoId }, select: { id: true, cantidadInventario: true }, order: { id: 'ASC' },
      });
      // Redis no conserva hashes vacíos. No inventar un producto ni marcar un hash inexistente como listo.
      if (filas.length === 0) throw new ConflictException({ codigo: 'ESTABLECIMIENTO_SIN_PRODUCTOS' });
      return filas.map((producto) => {
        if (!Number.isInteger(producto.cantidadInventario) || producto.cantidadInventario < 0 || producto.cantidadInventario > 2147483647) {
          throw new ConflictException({ codigo: 'INVENTARIO_POSTGRES_INVALIDO' });
        }
        return { productoId: producto.id, cantidadInventario: producto.cantidadInventario };
      });
    });
    const [stock, , vencimientos, preparado] = clavesReserva(establecimientoId, '');
    let resultado: { codigo: string };
    try {
      resultado = JSON.parse(String(await this.redis.eval(PREPARAR_INVENTARIO_LUA, 3,
        stock, preparado, vencimientos, establecimientoId, JSON.stringify(productos))));
      if (!resultado || typeof resultado.codigo !== 'string') throw new Error('Respuesta inválida');
    } catch {
      // No borrar ni reintentar automáticamente: la preparación pudo ejecutarse pese al timeout.
      throw new ServiceUnavailableException({ codigo: 'PREPARACION_RESULTADO_INCIERTO' });
    }
    switch (resultado.codigo) {
      case 'OK': return { establecimientoId, productosPreparados: productos.length };
      case 'INVENTARIO_YA_EXISTENTE': throw new ConflictException({ codigo: resultado.codigo });
      case 'DATOS_INCONSISTENTES': case 'PRODUCTOS_INVALIDOS': throw new ServiceUnavailableException({ codigo: resultado.codigo });
      default: throw new ServiceUnavailableException({ codigo: 'PREPARACION_RESULTADO_INCIERTO' });
    }
  }
}
