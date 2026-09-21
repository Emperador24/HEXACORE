import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { ConfiguracionServicio } from '../config/configuracion';
import { SaludController } from './salud.controller';

describe('SaludController', () => {
  const config = { entorno: 'test' } as ConfiguracionServicio;
  let query: jest.Mock;
  let respuesta: Response;
  let controlador: SaludController;

  beforeEach(() => {
    jest.useFakeTimers();
    query = jest.fn();
    respuesta = { status: jest.fn() } as unknown as Response;
    controlador = new SaludController(config, { query } as unknown as DataSource);
  });

  afterEach(() => { jest.useRealTimers(); });

  it('responde 200 cuando PostgreSQL responde a SELECT 1', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    const cuerpo = await controlador.estado(respuesta);
    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(respuesta.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(cuerpo).toMatchObject({ servicio: 'pedidos', estado: 'arriba', dependencias: { postgres: 'arriba' } });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('responde 503 sin propagar ni exponer el error de PostgreSQL', async () => {
    query.mockRejectedValue(new Error('detalle interno de conexión'));
    const cuerpo = await controlador.estado(respuesta);
    expect(respuesta.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(cuerpo.estado).toBe('degradado');
    expect(cuerpo.dependencias.postgres).toBe('caido');
    expect(JSON.stringify(cuerpo)).not.toContain('detalle interno');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('responde 503 al superar un segundo sin respuesta de PostgreSQL', async () => {
    query.mockImplementation(() => new Promise(() => {}));
    const pendiente = controlador.estado(respuesta);
    await jest.advanceTimersByTimeAsync(1000);
    const cuerpo = await pendiente;
    expect(respuesta.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(cuerpo.dependencias.postgres).toBe('caido');
    expect(jest.getTimerCount()).toBe(0);
  });
});
