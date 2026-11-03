import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import Redis from 'ioredis';
import { REDIS_INVENTARIO } from './redis-inventario.provider';
import { CERRAR_LUA, RESERVAR_LUA } from './reservas.scripts';

export interface ProductoReserva { productoId: string; cantidad: number }
export interface SolicitudReserva {
  pedidoId: string;
  establecimientoId: string;
  productos: ProductoReserva[];
  expiraEn: Date;
}
export interface ResultadoReserva {
  estado: 'ACTIVA' | 'LIBERADA' | 'CONSUMIDA';
  expiraEn: Date;
  repetida: boolean;
}

/** Clave global por pedido: cambiar de establecimiento no permite reservar dos veces con el mismo UUID. */
export function clavesReserva(establecimientoId: string, pedidoId: string): [string, string, string, string] {
  const prefijo = 'pedidos:inv:{inventario}';
  return [`${prefijo}:disponibles:${establecimientoId}`, `${prefijo}:reserva:${pedidoId}`, `${prefijo}:vencimientos`, `${prefijo}:preparado:${establecimientoId}`];
}

@Injectable()
export class ReservasService {
  constructor(@Inject(REDIS_INVENTARIO) private readonly redis: Redis) {}

  async reservar(datos: SolicitudReserva): Promise<ResultadoReserva> {
    const pedidoId = this.uuid(datos.pedidoId);
    const establecimientoId = this.uuid(datos.establecimientoId);
    if (!(datos.expiraEn instanceof Date) || !Number.isSafeInteger(datos.expiraEn.getTime()) || datos.expiraEn.getTime() <= 0 ||
        !Array.isArray(datos.productos) || datos.productos.length === 0) throw new BadRequestException({ codigo: 'RESERVA_INVALIDA' });
    const vistos = new Set<string>();
    const productos = datos.productos.map((producto) => {
      if (!producto || !Number.isInteger(producto.cantidad) || producto.cantidad <= 0 || producto.cantidad > 2147483647) {
        throw new BadRequestException({ codigo: 'CANTIDAD_INVALIDA' });
      }
      const productoId = this.uuid(producto.productoId);
      if (vistos.has(productoId)) throw new BadRequestException({ codigo: 'PRODUCTO_REPETIDO' });
      vistos.add(productoId);
      // Proyección explícita: ningún otro campo recibido puede terminar en Redis.
      return { productoId, cantidad: producto.cantidad };
    }).sort((a, b) => a.productoId < b.productoId ? -1 : a.productoId > b.productoId ? 1 : 0);
    return this.ejecutar(RESERVAR_LUA, establecimientoId, pedidoId, JSON.stringify(productos), String(datos.expiraEn.getTime()));
  }

  /** El futuro coordinador debe comprobar en PostgreSQL que es seguro liberar, incluso si venció. */
  liberar(establecimientoId: string, pedidoId: string): Promise<ResultadoReserva> {
    return this.ejecutar(CERRAR_LUA, this.uuid(establecimientoId), this.uuid(pedidoId), 'LIBERADA');
  }

  /** Solo debe invocarse tras el commit del descuento PostgreSQL; aquí no se confirma ninguna compra. */
  consumir(establecimientoId: string, pedidoId: string): Promise<ResultadoReserva> {
    return this.ejecutar(CERRAR_LUA, this.uuid(establecimientoId), this.uuid(pedidoId), 'CONSUMIDA');
  }

  private uuid(valor: string): string {
    if (typeof valor !== 'string' || !isUUID(valor)) throw new BadRequestException({ codigo: 'UUID_INVALIDO' });
    return valor.toLowerCase();
  }

  private async ejecutar(script: string, establecimientoId: string, pedidoId: string, ...args: string[]): Promise<ResultadoReserva> {
    let resultado: { codigo: string; estado?: ResultadoReserva['estado']; expiraEn?: number; repetida?: boolean };
    try {
      const respuesta = await this.redis.eval(script, 4, ...clavesReserva(establecimientoId, pedidoId), establecimientoId, pedidoId, ...args);
      resultado = JSON.parse(String(respuesta));
      if (!resultado || typeof resultado.codigo !== 'string') throw new Error('Respuesta inválida');
    } catch {
      // No registrar payload ni error crudo. El resultado puede ser incierto si hubo timeout.
      throw new ServiceUnavailableException({ codigo: 'RESERVA_RESULTADO_INCIERTO' });
    }
    switch (resultado.codigo) {
      case 'OK':
        if (!['ACTIVA', 'LIBERADA', 'CONSUMIDA'].includes(resultado.estado ?? '') ||
            !Number.isSafeInteger(resultado.expiraEn) || typeof resultado.repetida !== 'boolean') {
          throw new ServiceUnavailableException({ codigo: 'RESERVA_RESULTADO_INCIERTO' });
        }
        return { estado: resultado.estado!, expiraEn: new Date(resultado.expiraEn!), repetida: resultado.repetida };
      case 'RESERVA_NO_ENCONTRADA': throw new NotFoundException({ codigo: resultado.codigo });
      case 'ENTRADA_INVALIDA': case 'VENCIMIENTO_INVALIDO': throw new BadRequestException({ codigo: resultado.codigo });
      case 'RESERVA_INCOMPATIBLE': case 'RESERVA_CERRADA': case 'INVENTARIO_INSUFICIENTE':
        throw new ConflictException({ codigo: resultado.codigo });
      case 'INVENTARIO_NO_PREPARADO': case 'DATOS_INCONSISTENTES':
        throw new ServiceUnavailableException({ codigo: resultado.codigo });
      default: throw new ServiceUnavailableException({ codigo: 'RESERVA_RESULTADO_INCIERTO' });
    }
  }
}
