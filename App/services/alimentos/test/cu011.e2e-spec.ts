import 'reflect-metadata';
import { ChildProcess, execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JwtService } from '@nestjs/jwt';
import { Channel, ChannelModel, connect, ConsumeMessage } from 'amqplib';
import Redis from 'ioredis';
import { DataSource, In } from 'typeorm';
import { cargarConfiguracion } from '../src/comun/config/configuracion';
import { opcionesDataSource } from '../src/persistencia/data-source';
import { EventoReferencia } from '../src/persistencia/entidades/evento-referencia.entity';
import { Establecimiento, EstadoEstablecimiento } from '../src/persistencia/entidades/establecimiento.entity';
import { Producto } from '../src/persistencia/entidades/producto.entity';
import { Pedido } from '../src/persistencia/entidades/pedido.entity';
import { DetallePedido } from '../src/persistencia/entidades/detalle-pedido.entity';
import { ReservaInventario } from '../src/persistencia/entidades/reserva-inventario.entity';
import { TransaccionPedido } from '../src/persistencia/entidades/transaccion-pedido.entity';
import { clavesReserva } from '../src/inventario/reservas.service';
import { CLAVE_PEDIDO_CONFIRMADO, EVENTO_PEDIDO_CONFIRMADO, EXCHANGE_PEDIDOS } from '../src/pagos/eventos/pedido-confirmado.evento';

const pausa = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function esperar(condicion: () => Promise<boolean> | boolean, timeout = 5000): Promise<void> {
  const limite = Date.now() + timeout;
  while (!await condicion()) {
    if (Date.now() >= limite) throw new Error('Dependencia/evento E2E no disponible en 5 segundos');
    await pausa(25);
  }
}

describe('CU-011 Alimentos → Pagos → pasarela con persistencia y mensajería reales', () => {
  let servidor: ChildProcess;
  let salidaServidor = '';
  let datos: DataSource;
  let libroPagos: DataSource;
  let redis: Redis;
  let amqp: ChannelModel;
  let canal: Channel;
  let base: string;
  let token: string;
  const evento = randomUUID(), local = randomUUID(), cliente = randomUUID();
  const productos = [randomUUID(), randomUUID()];
  const recibidos: ConsumeMessage[] = [];
  let checkout: { id: string; expiraEn: string };
  let claveAprobada: string;
  let pagoAprobado: Record<string, unknown>;

  async function detenerServidor(): Promise<void> {
    if (!servidor || servidor.exitCode !== null || servidor.signalCode !== null) return;
    const cerrado = new Promise<void>((resolve) => servidor.once('exit', () => resolve()));
    servidor.kill('SIGTERM');
    let forzado = false;
    const timer = setTimeout(() => { forzado = true; servidor.kill('SIGKILL'); }, 5000);
    try { await cerrado; } finally { clearTimeout(timer); }
    if (forzado) throw new Error(`Alimentos no terminó tras SIGTERM: ${salidaServidor}`);
  }

  async function movimiento(clave: string): Promise<Record<string, unknown>> {
    const filas = await libroPagos.query(
      'SELECT resultado, solicitante, monto, moneda, referencia, intentos FROM transacciones_pago WHERE clave_idempotencia = $1',
      [clave],
    );
    expect(filas).toHaveLength(1);
    return filas[0];
  }

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
    expect(config.postgres).toMatchObject({ host: '127.0.0.1', puerto: 15435,
      usuario: 'cu011_e2e', base: 'alimentos_cu011_e2e' });
    expect(config.pagos.url).toBe('http://127.0.0.1:13088/api/v1');
    expect(config.redis).toEqual({ host: '127.0.0.1', puerto: 16382 });
    expect(config.rabbitmq.url).toBe('amqp://cu011_e2e:cu011_e2e@127.0.0.1:15675/cu011');
    const saludPagos = await fetch(`${config.pagos.url}/salud`, { signal: AbortSignal.timeout(3000) });
    expect(saludPagos.status).toBe(200);
    libroPagos = new DataSource({ type: 'postgres', host: config.postgres.host, port: config.postgres.puerto,
      username: config.postgres.usuario, password: config.postgres.contrasena, database: 'pagos_cu011_e2e',
      synchronize: false });
    await libroPagos.initialize();
    datos = new DataSource(opcionesDataSource(config));
    await datos.initialize();
    await datos.runMigrations();
    redis = new Redis({ host: config.redis.host, port: config.redis.puerto, lazyConnect: true,
      retryStrategy: () => null, maxRetriesPerRequest: 1 });
    await redis.connect();
    token = new JwtService().sign({ sub: cliente, roles: ['Cliente'], jti: randomUUID() }, {
      algorithm: 'RS256', issuer: config.emisorTokens, expiresIn: '10m',
      privateKey: readFileSync(resolve(__dirname, 'claves/jwt-privada.pem'), 'utf8'),
    });
    await datos.manager.insert(EventoReferencia, { eventoId: evento, nombre: 'Evento E2E', disponible: true });
    await datos.manager.insert(Establecimiento, { id: local, eventoId: evento, nombre: 'Local E2E',
      estado: EstadoEstablecimiento.DISPONIBLE, puntoEntrega: 'Módulo E2E' });
    await datos.manager.insert(Producto, productos.map((id, i) => ({ id, establecimientoId: local,
      nombre: `Producto E2E ${i}`, precio: i === 0 ? '25000.00' : '6000.00', activo: true, cantidadInventario: 5 })));
    // Ejecuta el preparador real, sin introducir @nestjs/typeorm ESM en el
    // runtime CommonJS de Jest 30/Node 22. Node carga los módulos nativamente.
    const preparado = execFileSync(process.execPath,
      [resolve(__dirname, '../dist/inventario/preparar-inventario.js'), local, '--compras-detenidas'],
      { env: process.env, encoding: 'utf8', timeout: 10000 });
    expect(preparado).toContain(`Inventario preparado: ${local}, 2 productos.`);
    expect(config.puerto).toBe(13087);
    base = `http://127.0.0.1:${config.puerto}`;
    // main.js usa el AppModule/ValidationPipe reales. No hay mocks, mappers ni
    // providers reemplazados. El proceso hijo hereda solo los destinos fijados.
    servidor = spawn(process.execPath, [resolve(__dirname, '../dist/main.js')],
      { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let errorArranque: Error | undefined;
    servidor.once('error', (error) => { errorArranque = error; });
    servidor.stdout!.on('data', (trozo: Buffer) => { salidaServidor += trozo.toString(); });
    servidor.stderr!.on('data', (trozo: Buffer) => { salidaServidor += trozo.toString(); });
    await esperar(() => {
      if (errorArranque) throw errorArranque;
      if (servidor.exitCode !== null || servidor.signalCode !== null) {
        throw new Error(`Alimentos terminó durante el arranque: ${salidaServidor}`);
      }
      return salidaServidor.includes('Alimentos escuchando') && salidaServidor.includes('Conectado a RabbitMQ;');
    }, 15000);
    const salud = await fetch(`${base}/api/v1/salud`, { signal: AbortSignal.timeout(3000) });
    expect(salud.status).toBe(200);
    expect(await salud.json()).toMatchObject({ servicio: 'alimentos', entorno: 'test', estado: 'arriba' });
    amqp = await connect(config.rabbitmq.url);
    canal = await amqp.createChannel();
    const cola = await canal.assertQueue('', { exclusive: true, autoDelete: true });
    await canal.bindQueue(cola.queue, EXCHANGE_PEDIDOS, CLAVE_PEDIDO_CONFIRMADO);
    await canal.consume(cola.queue, (mensaje) => {
      if (mensaje) { recibidos.push(mensaje); canal.ack(mensaje); }
    });
  });

  afterAll(async () => {
    try {
      await detenerServidor();
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
          try { redis?.disconnect(); }
          finally {
            try { if (datos?.isInitialized) await datos.destroy(); }
            finally { if (libroPagos?.isInitialized) await libroPagos.destroy(); }
          }
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
    const clave = randomUUID();
    const respuesta = await post(`${checkout.id}/pagos`, { tokenPago: 'tok_rechazo_e2e' }, clave);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.estadoPago).toBe('RECHAZADA');
    expect(respuesta.body.compraConfirmada).toBe(false);
    expect(await movimiento(clave)).toMatchObject({ resultado: 'RECHAZADO', solicitante: 'alimentos',
      monto: '62000.00', moneda: 'COP', intentos: 1 });
    expect((await datos.manager.findOneByOrFail(Pedido, { id: checkout.id })).estado).toBe('PENDIENTE_PAGO');
    expect((await datos.manager.findBy(Producto, { establecimientoId: local })).map((p) => p.cantidadInventario)).toEqual([5, 5]);
    await pausa(100);
    expect(recibidos).toHaveLength(0);
  });

  it('pago aprobado confirma, descuenta una vez, consume Redis y publica el evento real', async () => {
    claveAprobada = randomUUID();
    const respuesta = await post(`${checkout.id}/pagos`, { tokenPago: 'tok_ok_e2e' }, claveAprobada);
    pagoAprobado = respuesta.body;
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ estadoPago: 'APROBADA', estadoPedido: 'CONFIRMADO', compraConfirmada: true });
    expect(respuesta.body.codigoQr).toMatch(/^[0-9a-f]{64}$/);
    const pedido = await datos.manager.findOneByOrFail(Pedido, { id: checkout.id });
    expect(pedido.estado).toBe('CONFIRMADO');
    expect(pedido.confirmadoEn).toBeInstanceOf(Date);
    expect(pedido.codigoQr).toBe(respuesta.body.codigoQr);
    expect((await datos.manager.findBy(Producto, { establecimientoId: local })).map((p) => p.cantidadInventario)).toEqual([3, 3]);
    expect((await datos.manager.findOneByOrFail(TransaccionPedido, { id: claveAprobada })).estado).toBe('APROBADA');
    expect(respuesta.body.referenciaPasarela).toMatch(/^pas_/);
    expect(await movimiento(claveAprobada)).toMatchObject({ resultado: 'APROBADO', solicitante: 'alimentos',
      monto: '62000.00', moneda: 'COP', referencia: respuesta.body.referenciaPasarela, intentos: 1 });
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
  });

  it('repetir el pago devuelve el mismo QR sin otro descuento, evento ni movimiento', async () => {
    const replay = await post(`${checkout.id}/pagos`, { tokenPago: 'tok_ok_e2e' }, claveAprobada);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(pagoAprobado);
    await pausa(200);
    expect(recibidos).toHaveLength(1);
    expect((await datos.manager.findBy(Producto, { establecimientoId: local })).map((p) => p.cantidadInventario)).toEqual([3, 3]);
    expect(await datos.manager.countBy(TransaccionPedido, { pedidoId: checkout.id })).toBe(2);
    expect(await movimiento(claveAprobada)).toMatchObject({ intentos: 1, referencia: pagoAprobado.referenciaPasarela });
    expect((await post(`${checkout.id}/pagos`, { tokenPago: 'tok_ok_e2e' }, randomUUID())).status).toBe(409);
  });
});
