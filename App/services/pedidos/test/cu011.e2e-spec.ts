import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Channel, ChannelModel, connect, ConsumeMessage } from 'amqplib';
import Redis from 'ioredis';
import { DataSource, In } from 'typeorm';
import { AppModule } from '../src/app.module';
import { cargarConfiguracion } from '../src/config/configuracion';
import { opcionesDataSource } from '../src/persistencia/data-source';
import { EventoReferencia } from '../src/persistencia/entidades/evento-referencia.entity';
import { Establecimiento, EstadoEstablecimiento } from '../src/persistencia/entidades/establecimiento.entity';
import { Producto } from '../src/persistencia/entidades/producto.entity';
import { Pedido } from '../src/persistencia/entidades/pedido.entity';
import { DetallePedido } from '../src/persistencia/entidades/detalle-pedido.entity';
import { ReservaInventario } from '../src/persistencia/entidades/reserva-inventario.entity';
import { TransaccionPedido } from '../src/persistencia/entidades/transaccion-pedido.entity';
import { PreparacionInventarioService } from '../src/inventario/preparacion-inventario.service';
import { clavesReserva } from '../src/inventario/reservas.service';
import { REDIS_INVENTARIO } from '../src/inventario/redis-inventario.provider';
import { REDIS } from '../src/comun/autenticacion/redis.provider';
import { ConexionRabbitMq } from '../src/pagos/eventos/conexion-rabbitmq.service';
import { CLAVE_PEDIDO_CONFIRMADO, EVENTO_PEDIDO_CONFIRMADO, EXCHANGE_PEDIDOS } from '../src/pagos/eventos/pedido-confirmado.evento';

const pausa = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function esperar(condicion: () => Promise<boolean> | boolean): Promise<void> {
  const limite = Date.now() + 5000;
  while (!await condicion()) {
    if (Date.now() >= limite) throw new Error('Dependencia/evento E2E no disponible en 5 segundos');
    await pausa(25);
  }
}

describe('CU-011 HTTP + PostgreSQL + Redis + RabbitMQ reales', () => {
  let app: INestApplication;
  let datos: DataSource;
  let redis: Redis;
  let amqp: ChannelModel;
  let canal: Channel;
  let base: string;
  let token: string;
  const evento = randomUUID(), local = randomUUID(), cliente = randomUUID();
  const productos = [randomUUID(), randomUUID()];
  const recibidos: ConsumeMessage[] = [];
  let checkout: { id: string; expiraEn: string };

  async function post(ruta: string, cuerpo: unknown, clave?: string) {
    const respuesta = await fetch(`${base}/api/v1/pedidos/${ruta}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
        ...(clave ? { 'Idempotency-Key': clave } : {}) }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(10000),
    });
    return { status: respuesta.status, body: await respuesta.json() as Record<string, unknown> };
  }
  const entrada = () => ({ eventoId: evento, establecimientoId: local, metodoEntrega: 'RECOGER',
    productos: productos.map((productoId) => ({ productoId, cantidad: 2 })) });

  beforeAll(async () => {
    const config = cargarConfiguracion();
    expect(config.postgres.base).toBe('pedidos_e2e');
    datos = new DataSource(opcionesDataSource(config));
    await datos.initialize();
    await datos.runMigrations();
    app = await NestFactory.create(AppModule, { logger: false, forceCloseConnections: true });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    redis = app.get<Redis>(REDIS_INVENTARIO);
    await esperar(() => redis.status === 'ready' && app.get<Redis>(REDIS).status === 'ready' &&
      app.get(ConexionRabbitMq).obtenerCanal() !== null);
    amqp = await connect(config.rabbitmq.url);
    canal = await amqp.createChannel();
    const cola = await canal.assertQueue('', { exclusive: true, autoDelete: true });
    await canal.bindQueue(cola.queue, EXCHANGE_PEDIDOS, CLAVE_PEDIDO_CONFIRMADO);
    await canal.consume(cola.queue, (mensaje) => {
      if (mensaje) { recibidos.push(mensaje); canal.ack(mensaje); }
    });
    token = new JwtService().sign({ sub: cliente, roles: ['Cliente'], jti: randomUUID() }, {
      algorithm: 'RS256', issuer: config.autenticacion.emisor, expiresIn: '10m',
      privateKey: readFileSync(resolve(__dirname, '../../../infra/claves-desarrollo/jwt-privada.pem'), 'utf8'),
    });
    await datos.manager.insert(EventoReferencia, { eventoId: evento, nombre: 'Evento E2E', disponible: true });
    await datos.manager.insert(Establecimiento, { id: local, eventoId: evento, nombre: 'Local E2E',
      estado: EstadoEstablecimiento.DISPONIBLE, puntoEntrega: 'Módulo E2E' });
    await datos.manager.insert(Producto, productos.map((id, i) => ({ id, establecimientoId: local,
      nombre: `Producto E2E ${i}`, precio: i === 0 ? '25000.00' : '6000.00', activo: true, cantidadInventario: 5 })));
    await app.get(PreparacionInventarioService).preparar(local);
  });

  afterAll(async () => {
    try {
      // Solo fixtures propios; sin TRUNCATE, FLUSHDB, purgas o consumidores de colas ajenas.
      if (datos?.isInitialized) {
        const filas = await datos.manager.find(Pedido, { where: { establecimientoId: local } });
        if (redis?.status === 'ready') {
          for (const fila of filas) {
            const [, reserva, vencimientos] = clavesReserva(local, fila.id);
            await redis.del(reserva);
            await redis.zrem(vencimientos, fila.id);
          }
          const [stock, , , preparado] = clavesReserva(local, '');
          await redis.del(stock, preparado);
        }
        await datos.transaction(async (gestor) => {
          const ids = filas.map((p) => p.id);
          if (ids.length) {
            await gestor.delete(TransaccionPedido, { pedidoId: In(ids) });
            await gestor.delete(DetallePedido, { pedidoId: In(ids) });
            await gestor.delete(ReservaInventario, { pedidoId: In(ids) });
            await gestor.delete(Pedido, { id: In(ids) });
          }
          await gestor.delete(Producto, { establecimientoId: local });
          await gestor.delete(Establecimiento, { id: local });
          await gestor.delete(EventoReferencia, { eventoId: evento });
        });
      }
    } finally {
      // Cerrar canal antes de su conexión: cierres AMQP simultáneos pueden dejar una promesa esperando.
      try { await canal?.close(); }
      finally {
        try { await amqp?.close(); }
        finally {
          try { await app?.close(); }
          finally { if (datos?.isInitialized) await datos.destroy(); }
        }
      }
    }
  });

  it('crea checkout y reserva varios productos atómicamente sin descontar PostgreSQL', async () => {
    const respuesta = await post('checkout', entrada());
    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({ estado: 'PENDIENTE_PAGO', total: '62000.00', inventarioReservado: true });
    expect(typeof respuesta.body.id).toBe('string');
    expect(typeof respuesta.body.expiraEn).toBe('string');
    checkout = { id: respuesta.body.id as string, expiraEn: respuesta.body.expiraEn as string };
    const [stock, reserva, vencimientos] = clavesReserva(local, checkout.id);
    expect(await redis.hmget(stock, ...productos)).toEqual(['3', '3']);
    expect(await redis.hget(reserva, 'estado')).toBe('ACTIVA');
    expect(Number(await redis.zscore(vencimientos, checkout.id))).toBe(Date.parse(checkout.expiraEn));
    expect((await datos.manager.findOneByOrFail(ReservaInventario, { pedidoId: checkout.id })).estado).toBe('ACTIVA');
    expect((await datos.manager.findBy(Producto, { establecimientoId: local })).map((p) => p.cantidadInventario)).toEqual([5, 5]);
    expect(await datos.manager.countBy(DetallePedido, { pedidoId: checkout.id })).toBe(2);
    expect(recibidos).toHaveLength(0);
  });

  it('rechaza sobre-reserva y revierte Pedido/Detalle/Reserva en PostgreSQL', async () => {
    const respuesta = await post('checkout', { ...entrada(), productos: productos.map((productoId) => ({ productoId, cantidad: 4 })) });
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.codigo).toBe('INVENTARIO_INSUFICIENTE');
    expect(await datos.manager.countBy(Pedido, { establecimientoId: local })).toBe(1);
    const [stock] = clavesReserva(local, checkout.id);
    expect(await redis.hmget(stock, ...productos)).toEqual(['3', '3']);
  });

  it('rechazo de pasarela conserva la reserva y no publica ni descuenta inventario', async () => {
    const respuesta = await post(`${checkout.id}/pagos`, { tokenPago: 'tok_rechazo_e2e' }, randomUUID());
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.estadoPago).toBe('RECHAZADA');
    expect(respuesta.body.compraConfirmada).toBe(false);
    expect((await datos.manager.findOneByOrFail(Pedido, { id: checkout.id })).estado).toBe('PENDIENTE_PAGO');
    expect((await datos.manager.findBy(Producto, { establecimientoId: local })).map((p) => p.cantidadInventario)).toEqual([5, 5]);
    await pausa(100);
    expect(recibidos).toHaveLength(0);
  });

  it('pago aprobado confirma, descuenta una vez, consume Redis y publica el evento real', async () => {
    const clave = randomUUID();
    const respuesta = await post(`${checkout.id}/pagos`, { tokenPago: 'tok_ok_e2e' }, clave);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ estadoPago: 'APROBADA', estadoPedido: 'CONFIRMADO', compraConfirmada: true });
    expect(respuesta.body.codigoQr).toMatch(/^[0-9a-f]{64}$/);
    const pedido = await datos.manager.findOneByOrFail(Pedido, { id: checkout.id });
    expect(pedido.estado).toBe('CONFIRMADO');
    expect(pedido.confirmadoEn).toBeInstanceOf(Date);
    expect(pedido.codigoQr).toBe(respuesta.body.codigoQr);
    expect((await datos.manager.findBy(Producto, { establecimientoId: local })).map((p) => p.cantidadInventario)).toEqual([3, 3]);
    expect((await datos.manager.findOneByOrFail(TransaccionPedido, { id: clave })).estado).toBe('APROBADA');
    expect((await datos.manager.findOneByOrFail(ReservaInventario, { pedidoId: checkout.id })).estado).toBe('CONSUMIDA');
    const [stock, reserva, vencimientos] = clavesReserva(local, checkout.id);
    expect(await redis.hget(reserva, 'estado')).toBe('CONSUMIDA');
    expect(await redis.hmget(stock, ...productos)).toEqual(['3', '3']);
    expect(await redis.zscore(vencimientos, checkout.id)).toBeNull();
    await esperar(() => recibidos.length === 1);
    expect(recibidos[0].properties.type).toBe(EVENTO_PEDIDO_CONFIRMADO);
    expect(recibidos[0].properties.messageId).toBe(checkout.id);
    expect(recibidos[0].fields.routingKey).toBe(CLAVE_PEDIDO_CONFIRMADO);
    expect(JSON.parse(recibidos[0].content.toString())).toEqual({ pedidoId: checkout.id, establecimientoId: local,
      clienteId: cliente, total: '62000.00', moneda: 'COP', metodoEntrega: 'RECOGER', puntoEntrega: 'Módulo E2E',
      confirmadoEn: pedido.confirmadoEn!.toISOString(), productos: expect.arrayContaining(productos.map((productoId, i) => ({
        productoId, nombreProducto: `Producto E2E ${i}`, cantidad: 2, precioUnitario: i === 0 ? '25000.00' : '6000.00',
      }))) });
    const replay = await post(`${checkout.id}/pagos`, { tokenPago: 'tok_ok_e2e' }, clave);
    expect(replay.body).toEqual(respuesta.body);
    await pausa(200);
    expect(recibidos).toHaveLength(1);
    expect((await datos.manager.findBy(Producto, { establecimientoId: local })).map((p) => p.cantidadInventario)).toEqual([3, 3]);
    expect((await post(`${checkout.id}/pagos`, { tokenPago: 'tok_ok_e2e' }, randomUUID())).status).toBe(409);
  });
});
