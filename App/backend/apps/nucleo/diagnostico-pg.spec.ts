import { ArgumentsHost, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { DataSource, QueryFailedError } from 'typeorm';
import { contadoresPool, DiagnosticoPgFilter } from './diagnostico-pg.filter';

describe('Diagnóstico SQL sin alterar el contrato', () => {
  const datos = { options: { name: 'alimentos' }, driver: { master: { totalCount: 4, idleCount: 2, waitingCount: 0, options: { max: 10 } } } } as unknown as DataSource;
  it('distingue clientes libres de solicitudes esperando sin emitir SQL', () => {
    expect(contadoresPool(datos)).toEqual({ conexion: 'alimentos', total: 4, libres: 2, esperando: 0, maximo: 10 });
  });
  it('registra contadores y fase sin filtrar parámetros, conservando HTTP 500', () => {
    const logs = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const respuesta = { headersSent: false };
    const reply = jest.fn();
    const filtro = new DiagnosticoPgFilter({ httpAdapter: { isHeadersSent: () => false, reply } } as unknown as HttpAdapterHost,
      datos, datos, datos, datos, datos, datos, datos);
    try {
      const error = new QueryFailedError('SELECT secreto FROM pedidos WHERE token=$1', ['NO_REGISTRAR_TOKEN'], new Error('Query read timeout'));
      filtro.catch(error, { getArgByIndex: () => respuesta } as unknown as ArgumentsHost);
      const registro = JSON.parse(logs.mock.calls[0][0] as string);
      expect(registro).toMatchObject({ evento: 'FALLO_SQL', codigo: 'QUERY_READ_TIMEOUT', etapa: 'SELECT' });
      expect(JSON.stringify(registro)).not.toContain('NO_REGISTRAR_TOKEN'); expect(JSON.stringify(registro)).not.toContain('secreto');
      expect(reply).toHaveBeenCalledWith(respuesta, { statusCode: 500, message: 'Internal server error' }, 500);
    } finally { filtro.onModuleDestroy(); logs.mockRestore(); }
  });
});
