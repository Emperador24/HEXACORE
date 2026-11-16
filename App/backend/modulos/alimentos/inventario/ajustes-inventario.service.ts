import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { CONEXION_ALIMENTOS } from '../persistencia/conexion';
import { Establecimiento } from '../persistencia/entidades/establecimiento.entity';
import { Producto } from '../persistencia/entidades/producto.entity';
import { Pedido } from '../persistencia/entidades/pedido.entity';
import { OperacionInventario } from '../persistencia/entidades/operacion-inventario.entity';
import { RegistrarProductoDto, precioNormalizado } from '../menu/dto/guardar-producto.dto';
import { REDIS_INVENTARIO } from './redis-inventario.provider';
import { clavesReserva } from './reservas.service';
import { AJUSTAR_LUA } from './ajustes.scripts';

/** Intención SQL durable + Lua idempotente. Nunca reconstruye inventario existente. */
@Injectable()
export class AjustesInventarioService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AjustesInventarioService.name);
  private temporizador?: ReturnType<typeof setInterval>;
  private ciclo?: Promise<void>;
  private generacionRedis = 0;
  private readonly conexionCerrada = () => { this.generacionRedis++; };
  constructor(@InjectDataSource(CONEXION_ALIMENTOS) private readonly datos: DataSource,
    @Inject(REDIS_INVENTARIO) private readonly redis: Redis) {
    this.redis.on('close', this.conexionCerrada);
  }

  onModuleInit() {
    this.temporizador = setInterval(() => { void this.recuperarPendientes(); }, 5000);
    this.temporizador.unref();
    void this.recuperarPendientes();
  }
  async onModuleDestroy() {
    clearInterval(this.temporizador); await this.ciclo;
    this.redis.removeListener('close', this.conexionCerrada);
  }

  async solicitar(establecimientoId: string, actorId: string, id: string,
    datos: { productoId: string; delta: number; motivo: string } | { registro: RegistrarProductoDto }) {
    const alta = 'registro' in datos;
    const registro = alta ? { nombre: datos.registro.nombre, descripcion: datos.registro.descripcion ?? null,
      precio: precioNormalizado(datos.registro.precio), restriccionesAlimentarias: datos.registro.restriccionesAlimentarias,
      activo: datos.registro.activo, cantidadInicial: datos.registro.cantidadInicial } : undefined;
    if (registro && BigInt(registro.precio.replace('.', '')) <= 0n) throw new BadRequestException('El precio debe ser mayor que cero.');
    const peticion = alta ? { tipo: 'ALTA', establecimientoId, actorId, ...registro } :
      { tipo: 'AJUSTE', establecimientoId, actorId, productoId: datos.productoId, delta: datos.delta, motivo: datos.motivo };
    const huella = createHash('sha256').update(JSON.stringify(peticion)).digest('hex');
    try {
      await this.datos.transaction(async m => {
        const local = await m.findOne(Establecimiento, { where: { id: establecimientoId }, lock: { mode: 'pessimistic_write' } });
        if (!local) throw new NotFoundException('No existe el establecimiento');
        const previa = await m.findOneBy(OperacionInventario, { id });
        if (previa) {
          if (previa.huella !== huella) throw new ConflictException('La clave de idempotencia corresponde a otra operación.');
          return;
        }
        let producto: Producto;
        let inicializa = false;
        if (registro) {
          inicializa = !await m.exists(Producto, { where: { establecimientoId } }) && !await m.exists(Pedido, { where: { establecimientoId } });
          producto = await m.save(Producto, m.create(Producto, { establecimientoId, nombre: registro.nombre,
            descripcion: registro.descripcion, precio: registro.precio, restriccionesAlimentarias: registro.restriccionesAlimentarias,
            activo: registro.activo, cantidadInventario: 0 }));
        } else {
          const encontrado = await m.findOneBy(Producto, { id: (datos as { productoId: string }).productoId, establecimientoId });
          if (!encontrado) throw new NotFoundException('No existe el producto en este establecimiento');
          producto = encontrado;
        }
        await m.insert(OperacionInventario, { id, establecimientoId, productoId: producto.id, actorId,
          tipo: alta ? 'ALTA' : 'AJUSTE', delta: registro ? registro.cantidadInicial : (datos as { delta: number }).delta,
          motivo: registro ? 'Alta del producto' : (datos as { motivo: string }).motivo,
          huella, peticion, inicializa, estado: 'PENDIENTE' });
      });
    } catch (e) {
      const driver = (e as { driverError?: { code?: string; constraint?: string } }).driverError;
      if (driver?.code === '23505') {
        if (driver.constraint === 'uq_producto_establecimiento_nombre') throw new ConflictException('El producto ya está registrado en este establecimiento. Edita su ficha.');
        // Dos claves iguales en establecimientos distintos: no aceptar la petición perdedora.
        const previa = await this.datos.manager.findOneBy(OperacionInventario, { id });
        if (!previa || previa.huella !== huella) throw new ConflictException('La clave de idempotencia corresponde a otra operación.');
      } else throw e;
    }
    await this.recuperarEstablecimiento(establecimientoId);
    return this.consultar(establecimientoId, id);
  }

  async consultar(establecimientoId: string, id: string) {
    const op = await this.datos.manager.findOneBy(OperacionInventario, { id, establecimientoId });
    if (!op) throw new NotFoundException('No existe la operación en este establecimiento');
    // No exportar peticiones canónicas, huellas ni datos internos de idempotencia.
    const { peticion: _p, huella: _h, inicializa: _i, ...publica } = op;
    return publica;
  }
  async historial(establecimientoId: string, productoId?: string) {
    const ops = await this.datos.manager.find(OperacionInventario, {
      where: { establecimientoId, ...(productoId ? { productoId } : {}) }, order: { secuencia: 'DESC' }, take: 50 });
    return ops.map(({ peticion: _p, huella: _h, inicializa: _i, ...op }) => op);
  }
  recuperarPendientes(): Promise<void> {
    this.ciclo ??= (async () => {
      const pendientes = await this.datos.manager.find(OperacionInventario, { where: { estado: 'PENDIENTE' }, order: { secuencia: 'ASC' }, take: 50 });
      for (const id of new Set(pendientes.map(o => o.establecimientoId))) await this.recuperarEstablecimiento(id);
    })().catch(() => { this.log.warn('AJUSTES_INVENTARIO_PENDIENTES'); }).finally(() => { this.ciclo = undefined; });
    return this.ciclo;
  }
  async recuperarEstablecimiento(establecimientoId: string): Promise<void> {
    // Un fallo no cambia a RECHAZADA: su resultado puede haberse aplicado en Redis/SQL.
    try {
      for (let n = 0; n < 50; n++) {
        const continuar = await this.datos.transaction(async m => {
          await m.findOneOrFail(Establecimiento, { where: { id: establecimientoId }, lock: { mode: 'pessimistic_write' } });
          const op = await m.findOne(OperacionInventario, { where: { establecimientoId, estado: 'PENDIENTE' }, order: { secuencia: 'ASC' } });
          if (!op) return false;
          const producto = await m.findOneOrFail(Producto, { where: { id: op.productoId, establecimientoId }, lock: { mode: 'pessimistic_write' } });
          const despues = producto.cantidadInventario + op.delta;
          // Antes de Lua, sin cambiar físico ni disponible cuando el límite físico lo impide.
          if (!Number.isSafeInteger(despues) || despues < 0 || despues > 2147483647) {
            Object.assign(op, { estado: 'RECHAZADA', codigo: 'LIMITE_FISICO', fisicoAntes: producto.cantidadInventario,
              fisicoDespues: producto.cantidadInventario, terminadaEn: new Date() });
            await m.save(OperacionInventario, op); return true;
          }
          const [stock, , , marca] = clavesReserva(establecimientoId, '');
          const generacion = this.generacionRedis;
          const respuesta = JSON.parse(String(await this.redis.eval(AJUSTAR_LUA, 3, stock, marca,
            `pedidos:inv:{inventario}:ajuste:${op.id}`, op.huella, op.productoId, String(op.delta), op.tipo, op.inicializa ? '1' : '0')));
          if (respuesta.huella !== op.huella || !['APLICADA', 'RECHAZADA'].includes(respuesta.estado) ||
            !Number.isInteger(respuesta.antes) || !Number.isInteger(respuesta.despues)) throw new Error('AJUSTE_RESULTADO_INCIERTO');
          // Lua no acredita fsync. Exigir AOF local antes de confirmar físico en SQL.
          // El replay también escribe su marca en esta conexión para cubrir su offset.
          const persistencia = await this.redis.call('WAITAOF', '1', '0', '1500');
          // WAITAOF solo cubre las escrituras de su conexión, no las de una sesión anterior.
          if (generacion !== this.generacionRedis || !Array.isArray(persistencia) || Number(persistencia[0]) !== 1) throw new Error('AJUSTE_AOF_PENDIENTE');
          const antes = producto.cantidadInventario;
          if (respuesta.estado === 'APLICADA') {
            await m.increment(Producto, { id: producto.id, establecimientoId }, 'cantidadInventario', op.delta);
          }
          Object.assign(op, { estado: respuesta.estado, codigo: respuesta.codigo, fisicoAntes: antes,
            fisicoDespues: respuesta.estado === 'APLICADA' ? despues : antes,
            disponibleAntes: respuesta.antes, disponibleDespues: respuesta.despues, terminadaEn: new Date() });
          await m.save(OperacionInventario, op);
          return true;
        });
        if (!continuar) return;
      }
    } catch { this.log.warn(`AJUSTE_PENDIENTE establecimiento=${establecimientoId}`); }
  }
}
