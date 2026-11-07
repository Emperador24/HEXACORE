import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { CONEXION_ALIMENTOS } from '../persistencia/conexion';
import { Establecimiento } from '../persistencia/entidades/establecimiento.entity';
import { Producto } from '../persistencia/entidades/producto.entity';
import { OperacionInventario } from '../persistencia/entidades/operacion-inventario.entity';
import { aProductoDto, ProductoDto } from '../catalogo/dto/producto.dto';
import { REDIS_INVENTARIO } from './redis-inventario.provider';
import { clavesReserva } from './reservas.service';
import { recibePedidos } from '../establecimientos/horario';

@Injectable()
export class LecturaInventarioService {
  constructor(@InjectDataSource(CONEXION_ALIMENTOS) private readonly datos: DataSource,
    @Inject(REDIS_INVENTARIO) private readonly redis: Redis) {}
  async listar(establecimientoId: string, soloActivos = false): Promise<ProductoDto[]> {
    return this.datos.transaction(async m => {
      const local = await m.findOne(Establecimiento, { where: { id: establecimientoId }, lock: { mode: 'pessimistic_read' } });
      if (!local) throw new NotFoundException('No existe el establecimiento');
      if (soloActivos && !recibePedidos(local)) return [];
      const productos = await m.find(Producto, { where: { establecimientoId, ...(soloActivos ? { activo: true } : {}) },
        order: { nombre: 'ASC', id: 'ASC' }, lock: { mode: 'pessimistic_read' } });
      const pendiente = await m.exists(OperacionInventario, { where: { establecimientoId, estado: 'PENDIENTE' } });
      const [stock, , , marca] = clavesReserva(establecimientoId, '');
      let cantidades: Record<string, string> | null = null;
      if (!pendiente) {
        try {
          // Una sola lectura Redis para marca + hash; no reparar claves ausentes.
          cantidades = JSON.parse(String(await this.redis.eval(`
            if redis.call('TYPE',KEYS[1]).ok~='hash' or redis.call('TYPE',KEYS[2]).ok~='string' then return 'null' end
            if redis.call('GET',KEYS[2])~='1' then return 'null' end
            local a=redis.call('HGETALL',KEYS[1]);local r={};for i=1,#a,2 do r[a[i]]=a[i+1] end;return cjson.encode(r)
          `, 2, stock, marca)));
        } catch { cantidades = null; }
      }
      return productos.map(p => {
        const valor = cantidades?.[p.id];
        const n = valor !== undefined && /^(0|[1-9]\d*)$/.test(valor) ? Number(valor) : NaN;
        const fiable = Number.isSafeInteger(n) && n >= 0 && n <= p.cantidadInventario;
        return { ...aProductoDto(p), cantidadFisica: p.cantidadInventario,
          cantidadDisponible: fiable ? n : null, cantidadReservada: fiable ? p.cantidadInventario - n : null,
          inventarioEstado: pendiente ? 'PENDIENTE' : fiable ? 'DISPONIBLE' : 'NO_DISPONIBLE' };
      });
    });
  }
}
