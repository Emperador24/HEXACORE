import { opcionesSesion } from '../compartido/persistencia/esquemas';
const { base: basePruebas, opcionesPg } = require('./base-unica/conexiones.cjs');
import { opcionesDataSource as opcionesLogistica } from '../modulos/personal-logistica/persistencia/data-source';
import 'reflect-metadata';
import { ChildProcess, execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { JwtService } from '@nestjs/jwt';
import { Channel, ChannelModel, connect, ConsumeMessage } from 'amqplib';
import Redis from 'ioredis';
import { DataSource, In } from 'typeorm';
import { cargarConfiguracion as configuracionIdentidad } from '../modulos/identidad/comun/config/configuracion';
import { opcionesDataSource as opcionesIdentidad } from '../modulos/identidad/persistencia/data-source';
import { cifrarContrasena } from '../modulos/identidad/comun/contrasenas';
import { cargarConfiguracion } from '../modulos/alimentos/comun/config/configuracion';
import { opcionesDataSource } from '../modulos/alimentos/persistencia/data-source';
import { EventoReferencia } from '../modulos/alimentos/persistencia/entidades/evento-referencia.entity';
import { Establecimiento, EstadoEstablecimiento } from '../modulos/alimentos/persistencia/entidades/establecimiento.entity';
import { Producto } from '../modulos/alimentos/persistencia/entidades/producto.entity';
import { Pedido } from '../modulos/alimentos/persistencia/entidades/pedido.entity';
import { DetallePedido } from '../modulos/alimentos/persistencia/entidades/detalle-pedido.entity';
import { ReservaInventario } from '../modulos/alimentos/persistencia/entidades/reserva-inventario.entity';
import { TransaccionPedido } from '../modulos/alimentos/persistencia/entidades/transaccion-pedido.entity';
import { clavesReserva } from '../modulos/alimentos/inventario/reservas.service';
import { CLAVE_PEDIDO_CONFIRMADO, EVENTO_PEDIDO_CONFIRMADO, EXCHANGE_PEDIDOS } from '../modulos/alimentos/pagos/eventos/pedido-confirmado.evento';

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
  let cierreSolicitado = false;
  let datos: DataSource;
  let identidad: DataSource;
  let logistica: DataSource;
  let renovacion: string;
  const email = `nucleo-${randomUUID()}@example.test`;
  const contrasena = "clave-de-convivencia-cu011";
  let libroPagos: DataSource;
  let redis: Redis;
  let amqp: ChannelModel;
  let canal: Channel;
  let base: string;
  let token: string;
  const evento = randomUUID(), local = randomUUID(), cliente = randomUUID(), recinto = randomUUID();
  const productos = [randomUUID(), randomUUID()];
  const recibidos: ConsumeMessage[] = [];
  let checkout: { id: string; expiraEn: string };
  let claveAprobada: string;
  let pagoAprobado: Record<string, unknown>;

  async function detenerServidor(): Promise<void> {
    if (!servidor || cierreSolicitado) return;
    if (servidor.exitCode !== null || servidor.signalCode !== null) {
      throw new Error(`Núcleo terminó antes del SIGTERM de la prueba: ${salidaServidor}`);
    }
    cierreSolicitado = true;
    const cerrado = new Promise<void>((resolve) => servidor.once('exit', () => resolve()));
    servidor.kill('SIGTERM');
    let forzado = false;
    const timer = setTimeout(() => { forzado = true; servidor.kill('SIGKILL'); }, 5000);
    try { await cerrado; } finally { clearTimeout(timer); }
    if (forzado) throw new Error(`Núcleo no terminó tras SIGTERM: ${salidaServidor}`);
    expect(servidor.signalCode === 'SIGTERM' || servidor.exitCode === 0).toBe(true);
    expect(salidaServidor).not.toMatch(/UnknownElementException|Cierre de RabbitMQ con incidencias|EXPIRACION_RESERVAS_FALLIDA|ERROR/);
    expect(salidaServidor).toContain('Sondeo de reservas detenido');
    expect(salidaServidor).toContain('Consumidor de logística detenido');
    for (const fuente of [datos, identidad, logistica]) {
      const [{ conexiones }] = await fuente.query("SELECT count(*)::int AS conexiones FROM pg_stat_activity WHERE application_name IN ('nucleo-identidad', 'nucleo-alimentos', 'nucleo-personal-logistica', 'finanzas-pagos:nucleo') AND pid <> pg_backend_pid() AND backend_type = 'client backend'");
      expect(conexiones).toBe(0);
    }
    await esperar(async () => (await conexionesRabbit()).length === 0, 10000);
    expect(await conexionesRabbit()).toHaveLength(0);
    expect(await redis.client('LIST')).not.toMatch(/name=nucleo(?: |-inventario )/);
  }

  async function conexionesRabbit(): Promise<{ client_properties: { connection_name?: string } }[]> {
    const r = await fetch('http://127.0.0.1:16779/api/connections', {
      headers: { Authorization: `Basic ${Buffer.from('cu011_e2e:cu011_e2e').toString('base64')}` },
      signal: AbortSignal.timeout(3000),
    });
    expect(r.status).toBe(200);
    return ((await r.json()) as { client_properties: { connection_name?: string } }[])
      .filter((c) => c.client_properties.connection_name === 'hexacore-nucleo');
  }

  async function api(ruta: string, method = 'GET', cuerpo?: unknown, headers: Record<string, string> = {}) {
    return fetch(`${base}/api/v1/${ruta}`, { method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }), signal: AbortSignal.timeout(10000) });
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
    expect(config.postgres).toMatchObject({ host: '127.0.0.1', puerto: 15439,
      usuario: 'cu011_e2e', base: basePruebas });
    expect(config.redis).toEqual({ host: '127.0.0.1', puerto: 16384 });
    expect(config.rabbitmq.url).toBe('amqp://cu011_e2e:cu011_e2e@127.0.0.1:15679/cu011');
    libroPagos = new DataSource({ type: 'postgres', host: config.postgres.host, port: config.postgres.puerto,
      username: config.postgres.usuario, password: config.postgres.contrasena, database: basePruebas, extra: opcionesSesion('finanzas-pagos'), installExtensions: false,
      synchronize: false });
    await libroPagos.initialize();
    datos = new DataSource({ ...opcionesDataSource(config), extra: { ...opcionesSesion('alimentos'), application_name: 'observador-alimentos' } });
    await datos.initialize();

    redis = new Redis({ host: config.redis.host, port: config.redis.puerto, lazyConnect: true,
      retryStrategy: () => null, maxRetriesPerRequest: 1 });
    await redis.connect();
    const ci = configuracionIdentidad();
    expect(ci.postgres.base).toBe(basePruebas);
    identidad = new DataSource({ ...opcionesIdentidad(ci), extra: { ...opcionesSesion('identidad'), application_name: 'observador-identidad' } });
    await identidad.initialize();

    logistica = new DataSource({ ...opcionesLogistica(), extra: { ...opcionesSesion('personal-logistica'), application_name: 'observador-logistica' } });
    expect(logistica.options).toMatchObject({ database: basePruebas, synchronize: false });
    await logistica.initialize();
    await identidad.query(`INSERT INTO usuarios (id,nombre,email,hash_contrasena,estado,verificado_en)
      VALUES ($1,'Cuenta Núcleo E2E',$2,$3,'ACTIVA',now())`, [cliente, email, await cifrarContrasena(contrasena)]);
    await identidad.query(`INSERT INTO usuarios_roles (usuario_id,rol_id) SELECT $1,id FROM roles WHERE nombre='Cliente'`, [cliente]);
    // CU-015 consulta al dueño vigente, también en la regresión de CU-011.
    await datos.query(`INSERT INTO eventos_recintos.recintos(id,nombre,ciudad,capacidad)
      VALUES($1,$2,'Bogotá',100)`, [recinto, `Recinto CU011 E2E ${recinto}`]);
    await datos.query(`INSERT INTO eventos_recintos.eventos(id,nombre,categoria,recinto_id,fecha_inicio,fecha_fin,aforo_maximo,estado,creado_por)
      VALUES($1,'Evento CU011 E2E','Pruebas',$2,now()+interval '1 day',now()+interval '2 days',100,'PUBLICADO',$3)`, [evento,recinto,cliente]);
    await datos.manager.insert(EventoReferencia, { eventoId: evento, nombre: 'Evento E2E', disponible: true });
    await datos.manager.insert(Establecimiento, { id: local, eventoId: evento, nombre: 'Local E2E',
      estado: EstadoEstablecimiento.DISPONIBLE, puntoEntrega: 'Módulo E2E' });
    await datos.manager.insert(Producto, productos.map((id, i) => ({ id, establecimientoId: local,
      nombre: `Producto E2E ${i}`, precio: i === 0 ? '25000.00' : '6000.00', activo: true, cantidadInventario: 5 })));
    // Ejecuta el preparador real, sin introducir @nestjs/typeorm ESM en el
    // runtime CommonJS de Jest 30/Node 22. Node carga los módulos nativamente.
    const preparado = execFileSync(process.execPath,
      [resolve(__dirname, '../dist/modulos/alimentos/inventario/preparar-inventario.js'), local, '--compras-detenidas'],
      { env: process.env, encoding: 'utf8', timeout: 10000 });
    expect(preparado).toContain(`Inventario preparado: ${local}, 2 productos.`);
    expect(config.puerto).toBe(13087);
    base = `http://127.0.0.1:${config.puerto}`;
    // main.js usa el AppModule/ValidationPipe reales. No hay mocks, mappers ni
    // providers reemplazados. El proceso hijo hereda solo los destinos fijados.
    servidor = spawn(process.execPath, [resolve(__dirname, '../dist/apps/nucleo/main.js')],
      { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    mkdirSync(resolve(__dirname, '../.evidencia-e2e'), { recursive: true });
    writeFileSync(resolve(__dirname, '../.evidencia-e2e/servidor.pid'), String(servidor.pid));
    let errorArranque: Error | undefined;
    servidor.once('error', (error) => { errorArranque = error; });
    servidor.stdout!.on('data', (trozo: Buffer) => { salidaServidor += trozo.toString(); });
    servidor.stderr!.on('data', (trozo: Buffer) => { salidaServidor += trozo.toString(); });
    await esperar(() => {
      if (errorArranque) throw errorArranque;
      if (servidor.exitCode !== null || servidor.signalCode !== null) {
        throw new Error(`Alimentos terminó durante el arranque: ${salidaServidor}`);
      }
      return salidaServidor.includes('Núcleo escuchando') && salidaServidor.includes('Conectado a RabbitMQ;');
    }, 15000);
    const salud = await fetch(`${base}/api/v1/salud`, { signal: AbortSignal.timeout(3000) });
    expect(salud.status).toBe(200);
    expect(await salud.json()).toMatchObject({ servicio: 'nucleo', entorno: 'test', estado: 'arriba' });
    expect(salidaServidor.match(/6 topologías declaradas/g)).toHaveLength(1);
    expect(salidaServidor.match(/Sondeo de reservas iniciado/g)).toHaveLength(1);
    expect(salidaServidor).toContain(`pid=${servidor.pid}`);
    expect(salidaServidor).toMatch(/hilos=\d+/);
    await esperar(async () => (await conexionesRabbit()).length === 1, 10000);
    expect(await conexionesRabbit()).toHaveLength(1);
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
      if (logistica?.isInitialized) await logistica.destroy();
      if (identidad?.isInitialized) {
        const sesiones: { jti: string }[] = await identidad.query('SELECT jti FROM sesiones WHERE usuario_id=$1', [cliente]);
        for (const { jti } of sesiones) await redis.del(`sesion-revocada:${jti}`);
        await identidad.query('DELETE FROM usuarios WHERE id=$1', [cliente]);
        await identidad.destroy();
      }
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
          await gestor.query('DELETE FROM eventos_recintos.eventos WHERE id=$1', [evento]);
          await gestor.query('DELETE FROM eventos_recintos.recintos WHERE id=$1', [recinto]);
        });
      }
    } finally {
      mkdirSync(resolve(__dirname, '../.evidencia-e2e'), { recursive: true });
      writeFileSync(resolve(__dirname, '../.evidencia-e2e/cu011.log'), salidaServidor);
      rmSync(resolve(__dirname, '../.evidencia-e2e/servidor.pid'), { force: true });
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

  it('Identidad inicia sesión y consulta perfil en el mismo proceso que atenderá CU-011, usando su base', async () => {
    const respuesta = await api('sesiones', 'POST', { email, contrasena });
    expect(respuesta.status).toBe(200);
    const sesion = await respuesta.json() as { token: string; tokenRenovacion: string; usuario: { id: string } };
    expect(sesion.usuario.id).toBe(cliente);
    token = sesion.token; renovacion = sesion.tokenRenovacion;
    const verificado = new JwtService().verify(token, { publicKey: readFileSync(resolve(__dirname,'claves/jwt-publica.pem'),'utf8'),
      algorithms: ['RS256'], issuer: 'hexacore-administracion' });
    expect(verificado.sub).toBe(cliente);
    const perfil = await api('cuentas/perfil');
    expect(perfil.status).toBe(200);
    expect(await perfil.json()).toMatchObject({ id: cliente, email });
    expect((await api('admin/cuentas')).status).toBe(403);
    expect((await api('sesiones', 'POST', { email, contrasena, rol: 'Administrador' })).status).toBe(400);
    expect((await api('pedidos/checkout', 'POST', { ...entrada(), rol: 'Administrador' })).status).toBe(400);
    // Administración usa la conexión de Identidad y comprueba el rol vigente en BD.
    await identidad.query(`INSERT INTO usuarios_roles (usuario_id,rol_id) SELECT $1,id FROM roles WHERE nombre='Administrador'`, [cliente]);
    const ingresoAdmin = await api('sesiones', 'POST', { email, contrasena });
    expect(ingresoAdmin.status).toBe(200);
    const admin = await ingresoAdmin.json() as { token: string };
    const cabeceraAdmin = { Authorization: `Bearer ${admin.token}` };
    const listado = await api(`admin/cuentas?busqueda=${encodeURIComponent(email)}&limite=1`, 'GET', undefined, cabeceraAdmin);
    expect(listado.status).toBe(200);
    expect(await listado.json()).toMatchObject({ total: 1, cuentas: [{ id: cliente, email }] });
    const detalle = await api(`admin/cuentas/${cliente}`, 'GET', undefined, cabeceraAdmin);
    expect(detalle.status).toBe(200);
    expect(await detalle.json()).toMatchObject({ id: cliente, email, estado: 'ACTIVA', auditoria: [] });
    await identidad.query(`DELETE FROM usuarios_roles WHERE usuario_id=$1 AND rol_id IN (SELECT id FROM roles WHERE nombre='Administrador')`, [cliente]);
    expect((await api('admin/cuentas', 'GET', undefined, cabeceraAdmin)).status).toBe(403);
    expect((await api('sesiones/actual', 'DELETE', undefined, cabeceraAdmin)).status).toBe(200);
    expect((await identidad.query('SELECT current_database() AS base'))[0].base).toBe(basePruebas);
    expect((await datos.query('SELECT current_database() AS base'))[0].base).toBe(basePruebas);
    expect((await identidad.query("SELECT to_regclass('identidad.pedidos') AS tabla"))[0].tabla).toBeNull();
    expect((await datos.query("SELECT to_regclass('alimentos.usuarios') AS tabla"))[0].tabla).toBeNull();
    const activas = await identidad.query("SELECT DISTINCT application_name, datname, client_addr FROM pg_stat_activity WHERE application_name IN ('nucleo-identidad','nucleo-alimentos')");
    expect(activas).toEqual(expect.arrayContaining([
      expect.objectContaining({ application_name: 'nucleo-identidad', datname: basePruebas }),
      expect.objectContaining({ application_name: 'nucleo-alimentos', datname: basePruebas }),
    ]));
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
  it('renueva por cookie web HttpOnly y conserva la rotación y autorización', async () => {
    const r = await api('sesiones', 'POST', { email, contrasena }, { 'X-Hexacore-Cliente': 'web' });
    expect(r.status).toBe(200);
    expect(await r.json()).not.toHaveProperty('tokenRenovacion');
    const cookie = r.headers.get('set-cookie')!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toContain('Path=/api/v1/sesiones');
    const renovada = await api('sesiones/renovar', 'POST', {}, { 'X-Hexacore-Cliente': 'web', Cookie: cookie.split(';')[0] });
    expect(renovada.status).toBe(200);
    const cuerpo = await renovada.json() as { token: string };
    expect(cuerpo).not.toHaveProperty('tokenRenovacion');
    expect(renovada.headers.get('set-cookie')).not.toBe(cookie);
    expect((await api('cuentas/perfil', 'GET', undefined, { Authorization: `Bearer ${cuerpo.token}` })).status).toBe(200);
    const cerrada = await api('sesiones/actual', 'DELETE', undefined, { Authorization: `Bearer ${cuerpo.token}`, 'X-Hexacore-Cliente': 'web' });
    expect(cerrada.status).toBe(200);
    expect(cerrada.headers.get('set-cookie')).toContain('hxc_renovacion=;');
    expect(cerrada.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    expect((await api('sesiones/renovar', 'POST', {}, { 'X-Hexacore-Cliente': 'web', Cookie: renovada.headers.get('set-cookie')!.split(';')[0] })).status).toBe(401);
  });

  it('cerrar sesión revoca el acceso tanto a Identidad como a Alimentos y bloquea la renovación', async () => {
    expect((await api('sesiones/actual', 'DELETE')).status).toBe(200);
    const jti = new JwtService().decode(token).jti;
    expect(await redis.exists(`sesion-revocada:${jti}`)).toBe(1);
    expect((await identidad.query('SELECT revocada_en FROM sesiones WHERE jti=$1', [jti]))[0].revocada_en).not.toBeNull();
    expect((await api('cuentas/perfil')).status).toBe(401);
    expect((await post('checkout', entrada())).status).toBe(401);
    expect((await api('sesiones/renovar','POST',{ tokenRenovacion: renovacion })).status).toBe(401);
  });

  it('SIGTERM cierra el único proceso, ambas conexiones, Redis, RabbitMQ y el sondeo', async () => {
    await detenerServidor();
    await expect(fetch(`${base}/api/v1/salud`, { signal: AbortSignal.timeout(1000) })).rejects.toThrow();
  });

});
