import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConexionRabbitMq } from '../../compartido/rabbitmq/conexion-rabbitmq.service';
import { SaludBoleteriaController as SaludController } from './salud.controller';

/**
 * El balanceador (ADR-02) decide por el código HTTP si esta instancia recibe
 * tráfico. Lo que se prueba aquí es **qué dependencia tumba la instancia y cuál
 * no**, que es una decisión de diseño, no un detalle:
 *
 * - sin PostgreSQL o sin Redis no se puede vender -> 503;
 * - sin RabbitMQ sí se puede vender, solo faltan las notificaciones -> 200.
 */
describe('SaludController', () => {

  function controlador(opciones: { postgres: boolean; redis: boolean; rabbitmq: boolean; baseCaida?: number }) {
    const fuente = {
      query: opciones.postgres
        ? jest.fn().mockResolvedValue([{ '?column?': 1 }])
        : jest.fn().mockRejectedValue(new Error('sin conexión')),
    } as unknown as DataSource;
    const redis = { ping: opciones.redis ? jest.fn().mockResolvedValue('PONG') : jest.fn().mockRejectedValue(new Error('Redis caído')) } as unknown as Redis;
    const bases = [0,1,2,3].map(i => opciones.baseCaida === undefined || opciones.baseCaida === i ? fuente : {query:jest.fn().mockResolvedValue([])} as unknown as DataSource);
    const scheduler = {getCronJobs:()=>new Map()} as unknown as SchedulerRegistry;
    const rabbitmq = { conectado: opciones.rabbitmq } as unknown as ConexionRabbitMq;
    return new SaludController(bases[0], bases[1], bases[2], bases[3], redis, rabbitmq, scheduler);
  }

  function respuestaFalsa(): Response & { codigo?: number } {
    const respuesta = { status: jest.fn() } as unknown as Response & { codigo?: number };
    (respuesta.status as jest.Mock).mockImplementation((codigo: number) => {
      respuesta.codigo = codigo;
      return respuesta;
    });
    return respuesta;
  }

  it('responde 200 con todas las dependencias arriba', async () => {
    const respuesta = respuestaFalsa();

    const cuerpo = await controlador({ postgres: true, redis: true, rabbitmq: true }).estado(respuesta);

    expect(respuesta.codigo).toBe(HttpStatus.OK);
    expect(cuerpo.estado).toBe('arriba');
    expect(cuerpo.dependencias).toEqual({ postgres: {ventas:'arriba',catalogo:'arriba',postventa:'arriba','acceso-qr':'arriba'}, redis: 'arriba', rabbitmq: 'arriba' });
  });

  it.each([
    ['PostgreSQL ventas', { postgres: false, redis: true, rabbitmq: true, baseCaida:0 }],
    ['PostgreSQL catálogo', { postgres: false, redis: true, rabbitmq: true, baseCaida:1 }],
    ['PostgreSQL postventa', { postgres: false, redis: true, rabbitmq: true, baseCaida:2 }],
    ['PostgreSQL acceso', { postgres: false, redis: true, rabbitmq: true, baseCaida:3 }],
    ['Redis', { postgres: true, redis: false, rabbitmq: true }],
  ])('responde 503 si falta %s', async (_dependencia, estado) => {
    // Una instancia sin Redis no puede bloquear un checkout (ADR-03): aceptar
    // compras así abriría la ventana de doble venta que RNF-01 prohíbe.
    const respuesta = respuestaFalsa();

    const cuerpo = await controlador({ ...estado, rabbitmq: true }).estado(respuesta);

    expect(respuesta.codigo).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(cuerpo.estado).toBe('degradado');
  });

  it('sigue respondiendo 200 sin RabbitMQ, pero lo informa', async () => {
    // Publicar el evento ocurre DESPUÉS de cerrar la venta y fuera del camino
    // de respuesta: sacar la instancia de rotación por esto pararía las ventas
    // por un fallo en algo que solo manda correos.
    const respuesta = respuestaFalsa();

    const cuerpo = await controlador({ postgres: true, redis: true, rabbitmq: false }).estado(respuesta);

    expect(respuesta.codigo).toBe(HttpStatus.OK);
    expect(cuerpo.estado).toBe('degradado');
    expect(cuerpo.dependencias.rabbitmq).toBe('caido');
  });

  it('no propaga el fallo de la base como excepción', async () => {
    // Si lo hiciera, el endpoint devolvería 500 en vez del 503 que el
    // balanceador entiende.
    const respuesta = respuestaFalsa();

    await expect(
      controlador({ postgres: false, redis: false, rabbitmq: false }).estado(respuesta),
    ).resolves.toBeDefined();
  });
});
