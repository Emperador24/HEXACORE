import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Channel, ChannelModel, connect, ConsumeMessage } from 'amqplib';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { cargarConfiguracion } from '../src/config/configuracion';
import { opcionesDataSource } from '../src/persistencia/data-source';
import { Compra, EstadoCompra } from '../src/persistencia/entidades/compra.entity';
import { CodigoPromocional } from '../src/persistencia/entidades/codigo-promocional.entity';
import { Entrada, EstadoEntrada } from '../src/persistencia/entidades/entrada.entity';
import { EstadoEvento, EventoReferencia } from '../src/persistencia/entidades/evento-referencia.entity';
import { LocalidadEvento } from '../src/persistencia/entidades/localidad-evento.entity';
import { REDIS } from '../src/reventa/concurrencia/redis.provider';
import { ConexionRabbitMq } from '../src/reventa/eventos/conexion-rabbitmq.service';
import { EXCHANGE_VENTAS } from '../src/venta/notificaciones-venta.service';

const pausa = (ms: number) => new Promise<void>((listo) => setTimeout(listo, ms));
async function esperar(condicion: () => Promise<boolean> | boolean): Promise<void> {
  const limite = Date.now() + 5000;
  while (!(await condicion())) {
    if (Date.now() >= limite) throw new Error('Dependencia/evento E2E no disponible en 5 segundos');
    await pausa(25);
  }
}

const enDias = (dias: number) => new Date(Date.now() + dias * 24 * 60 * 60 * 1000);

/**
 * CU-001 contra PostgreSQL, Redis, RabbitMQ y la
 * pasarela simulada, todos en Docker 
 * sin dobles ni providers reemplazados
 *
 * Lo que cubre y las unitarias no pueden cubrir: que las migraciones se
 * apliquen de verdad, que los `CHECK` e índices del motor se cumplan, 
 * que los contadores resistan peticiones concurrentes y que el hecho llegue al broker.
 */
describe('CU-001 HTTP + PostgreSQL + RabbitMQ reales', () => {
  let app: INestApplication;
  let datos: DataSource;
  let amqp: ChannelModel;
  let canal: Channel;
  let base: string;
  let token: string;

  const evento = randomUUID();
  const localidad = randomUUID();
  const cliente = randomUUID();
  const PRECIO = 100_000;
  const AFORO = 5;
  const CUPON = `E2E${Date.now().toString().slice(-6)}`;
  const recibidos: ConsumeMessage[] = [];

  async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
    const respuesta = await fetch(`${base}/api/v1${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(10_000),
    });
    return { status: respuesta.status, body: (await respuesta.json()) as Record<string, any> };
  }

  const reservar = (cantidad: number) => pedir('POST', '/compras', { localidadId: localidad, cantidad });
  const pagar = (id: string, token_: string) =>
    pedir('POST', `/compras/${id}/pagar`, { metodoPago: 'TARJETA', token: token_ });

  /** El cupo que la localidad tiene apartado y vendido en la base, ahora mismo. */
  async function cupo(): Promise<{ vendidas: number; reservadas: number }> {
    const fila = await datos.manager.findOneOrFail(LocalidadEvento, { where: { localidadId: localidad } });
    return { vendidas: fila.vendidas, reservadas: fila.reservadas };
  }

  beforeAll(async () => {
    const config = cargarConfiguracion();
    // si el entorno no es el del Compose E2E
    // la suite borra los datos de la base de desarrollo en el teardown
    expect(config.postgres.base).toBe('entradas_e2e');

    datos = new DataSource(opcionesDataSource(config));
    await datos.initialize();
    await datos.runMigrations();

    app = await NestFactory.create(AppModule, { logger: false, forceCloseConnections: true });
    app.setGlobalPrefix('api/v1');
    // mismo pipe que main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();

    await esperar(
      () => app.get<Redis>(REDIS).status === 'ready' && app.get(ConexionRabbitMq).obtenerCanal() !== null,
    );

    // Cola propia para no se consumir ni purgar la cola real del servicio
    amqp = await connect(config.rabbitmq.url);
    canal = await amqp.createChannel();
    const cola = await canal.assertQueue('', { exclusive: true, autoDelete: true });
    await canal.bindQueue(cola.queue, EXCHANGE_VENTAS, 'compra.confirmada');
    await canal.consume(cola.queue, (mensaje) => {
      if (mensaje) {
        recibidos.push(mensaje);
        canal.ack(mensaje);
      }
    });

    token = new JwtService().sign(
      { sub: cliente, roles: ['Cliente'], jti: randomUUID() },
      {
        algorithm: 'RS256',
        issuer: config.autenticacion.emisor,
        expiresIn: '10m',
        privateKey: readFileSync(resolve(__dirname, '../../../infra/claves-desarrollo/jwt-privada.pem'), 'utf8'),
      },
    );

    // estado y categoria explícitos 
    await datos.manager.insert(EventoReferencia, {
      eventoId: evento,
      nombre: 'Evento E2E CU-001',
      fechaInicio: enDias(30),
      lugar: 'Recinto E2E',
      ciudad: 'Bogotá',
      permiteReventa: true,
      estado: EstadoEvento.PUBLICADO,
      categoria: 'Conciertos',
    });
    await datos.manager.insert(LocalidadEvento, {
      localidadId: localidad,
      eventoId: evento,
      nombre: 'General E2E',
      precio: PRECIO,
      aforo: AFORO,
      orden: 1,
    });
    await datos.manager.insert(CodigoPromocional, {
      codigo: CUPON,
      descripcion: 'Cupón de la suite E2E',
      porcentaje: 10,
      limiteUsos: 1,
      usos: 0,
      activo: true,
      vigenteDesde: enDias(-1),
      vigenteHasta: enDias(30),
      eventoId: evento,
      localidadId: null,
    });
  });

  afterAll(async () => {
    // No se borran los fixtures, y es a propósito: emitir una entrada escribe
    // en `historial_propietarios`, que un disparador de la migración inicial
    // hace inmutable (auditoría CU-006 / RNF-11). Borrar la entrada obligaría a
    // borrar antes su historial, que es justo lo que esa regla prohíbe, y una
    // prueba no debe desactivar la garantía que el sistema promete.
    //
    // Tampoco hace falta: `entradas_e2e` es una base desechable que se va con
    // `docker compose down -v`, y cada ejecución usa UUID nuevos, así que las
    // corridas no se ven entre sí y la suite se puede repetir tal cual.
    await canal?.close().catch(() => undefined);
    await amqp?.close().catch(() => undefined);
    await app?.close();
    await datos?.destroy();
  });

  it('las migraciones dejan el esquema de la venta primaria en pie', async () => {
    const tablas = ['compras', 'localidades_evento', 'codigos_promocionales', 'usos_promocion', 'ingresos', 'cancelaciones'];
    const filas: { table_name: string }[] = await datos.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [tablas],
    );
    expect(filas.map((f) => f.table_name).sort()).toEqual([...tablas].sort());
  });

  it('flujo básico: reserva, aplica cupón, paga y recibe un QR por entrada', async () => {
    const reserva = await reservar(2);
    expect(reserva.status).toBe(201);
    expect(reserva.body.estado).toBe(EstadoCompra.PENDIENTE);
    expect(reserva.body.total).toBe(200_000);
    // El cupo se aparta al reservar, antes de pagar
    expect(await cupo()).toEqual({ vendidas: 0, reservadas: 2 });

    const conCupon = await pedir('PUT', `/compras/${reserva.body.id}/cupon`, { codigo: CUPON });
    expect(conCupon.status).toBe(200);
    expect(conCupon.body.descuento).toBe(20_000);
    expect(conCupon.body.total).toBe(180_000);

    const pagada = await pagar(reserva.body.id, 'tok_ok_demo');
    expect(pagada.status).toBe(200);
    expect(pagada.body.estado).toBe(EstadoCompra.PAGADA);
    expect(pagada.body.entradas).toHaveLength(2);
    for (const entrada of pagada.body.entradas) {
      expect(entrada.codigoQr).toEqual(expect.any(String));
      expect(entrada.estado).toBe(EstadoEntrada.VALIDA);
    }
    // Dos QR distintos, y el descuento repartido suma el total cobrado.
    const qrs = new Set(pagada.body.entradas.map((e: { codigoQr: string }) => e.codigoQr));
    expect(qrs.size).toBe(2);
    const sumado = pagada.body.entradas.reduce((s: number, e: { precioPagado: number }) => s + e.precioPagado, 0);
    expect(sumado).toBe(180_000);

    // Lo reservado pasa a vendido y el uso del cupón queda confirmado
    expect(await cupo()).toEqual({ vendidas: 2, reservadas: 0 });
    const cupon = await datos.manager.findOneOrFail(CodigoPromocional, { where: { codigo: CUPON } });
    expect(cupon.usos).toBe(1);
  });

  it('el hecho COMPRA_CONFIRMADA llega al broker', async () => {
    await esperar(() => recibidos.length > 0);
    const evento_ = JSON.parse(recibidos[0].content.toString());
    expect(evento_.tipo).toBe('COMPRA_CONFIRMADA');
    expect(evento_.clienteId).toBe(cliente);
    expect(evento_.entradas).toHaveLength(2);
  });

  it('CU-001A: no deja reservar más entradas de las que quedan', async () => {
    const antes = await cupo();
    const respuesta = await reservar(4);
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.codigo).toBe('CU-001A');
    expect(await cupo()).toEqual(antes);
  });

  it('CU-001C: un pago rechazado deja la reserva viva para reintentar', async () => {
    const reserva = await reservar(1);
    const rechazado = await pagar(reserva.body.id, 'tok_rechazo_demo');
    expect(rechazado.status).toBe(409);
    expect(rechazado.body.codigo).toBe('CU-001C');

    // Sigue PENDIENTE y con cupo apartado
    const compra = await datos.manager.findOneOrFail(Compra, { where: { id: reserva.body.id } });
    expect(compra.estado).toBe(EstadoCompra.PENDIENTE);
    expect(compra.intentosRechazados).toBe(1);

    const aprobado = await pagar(reserva.body.id, 'tok_ok_demo');
    expect(aprobado.status).toBe(200);
    expect(aprobado.body.estado).toBe(EstadoCompra.PAGADA);
  });

  it('pagar dos veces la misma compra no emite entradas de más', async () => {
    const compras = await datos.manager.find(Compra, { where: { eventoId: evento, estado: EstadoCompra.PAGADA } });
    const pagada = compras[0];
    const entradasAntes = await datos.manager.count(Entrada, { where: { compraId: pagada.id } });

    const segunda = await pagar(pagada.id, 'tok_ok_demo');
    expect(segunda.status).toBe(409);
    expect(await datos.manager.count(Entrada, { where: { compraId: pagada.id } })).toBe(entradasAntes);
  });

  it('seguridad: un cuerpo con precio se rechaza, no se ignora', async () => {
    const respuesta = await pedir('POST', '/compras', { localidadId: localidad, cantidad: 1, precio: 1 });
    expect(respuesta.status).toBe(400);
  });

  it('el aforo resiste reservas simultáneas por el último cupo', async () => {
    const { vendidas, reservadas } = await cupo();
    const quedan = AFORO - vendidas - reservadas;
    expect(quedan).toBeGreaterThan(0);

    const respuestas = await Promise.all(Array.from({ length: quedan + 6 }, () => reservar(1)));
    const aceptadas = respuestas.filter((r) => r.status === 201);
    expect(aceptadas).toHaveLength(quedan);
    expect(respuestas.filter((r) => r.status === 409)).toHaveLength(6);

    // el CHECK del motor mira que nunca se pase del aforo.
    const final = await cupo();
    expect(final.vendidas + final.reservadas).toBe(AFORO);
  });
});
