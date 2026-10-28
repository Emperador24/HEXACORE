import { ConflictException } from '@nestjs/common';
import { PagosService } from './pagos.service';
import { TipoOperacion } from '../persistencia/entidades/transaccion-pago.entity';
import { ResultadoCobro } from './procesador-pagos';

/** Repositorio en memoria: lo que importa aquí es la política, no el SQL. */
function repositorioFalso() {
  const filas = new Map<string, any>();
  return {
    filas,
    findOne: async ({ where }: any) => filas.get(where.claveIdempotencia) ?? null,
    save: async (fila: any) => { filas.set(fila.claveIdempotencia, { ...fila }); return fila; },
  };
}

function servicio(pasarela: any) {
  const repo = repositorioFalso();
  const datos = { getRepository: () => repo } as any;
  return { srv: new PagosService(datos, pasarela), repo };
}

const COBRO = {
  claveIdempotencia: 'clave-0000001', solicitante: 'entradas',
  monto: 120000, moneda: 'COP', token: 'tok_ok', descripcion: 'Entrada',
};

describe('PagosService — idempotencia durable', () => {
  it('un resultado APROBADO no vuelve a la pasarela: se devuelve el guardado', async () => {
    const pasarela = {
      cobrar: jest.fn().mockResolvedValue({ resultado: ResultadoCobro.APROBADO, referencia: 'pas_1', motivo: null }),
      reembolsar: jest.fn(),
    };
    const { srv } = servicio(pasarela);

    const primera = await srv.cobrar(COBRO as any);
    const segunda = await srv.cobrar(COBRO as any);

    expect(primera.resultado).toBe(ResultadoCobro.APROBADO);
    expect(primera.repetida).toBe(false);
    expect(segunda.resultado).toBe(ResultadoCobro.APROBADO);
    expect(segunda.referencia).toBe('pas_1');
    // Lo que de verdad se comprueba: no hubo un segundo cobro.
    expect(segunda.repetida).toBe(true);
    expect(pasarela.cobrar).toHaveBeenCalledTimes(1);
  });

  it('un RECHAZADO también es final: tampoco se reintenta', async () => {
    const pasarela = {
      cobrar: jest.fn().mockResolvedValue({ resultado: ResultadoCobro.RECHAZADO, referencia: 'pas_2', motivo: 'FONDOS' }),
      reembolsar: jest.fn(),
    };
    const { srv } = servicio(pasarela);

    await srv.cobrar(COBRO as any);
    const segunda = await srv.cobrar(COBRO as any);

    expect(segunda.repetida).toBe(true);
    expect(pasarela.cobrar).toHaveBeenCalledTimes(1);
  });

  it('INDETERMINADO NO se congela: el reintento vuelve a preguntar con la misma clave', async () => {
    // Es la diferencia que justifica el tercer valor: la primera vez no se
    // supo, la segunda la pasarela ya puede decir que sí se había cobrado.
    const pasarela = {
      cobrar: jest.fn()
        .mockResolvedValueOnce({ resultado: ResultadoCobro.INDETERMINADO, referencia: null, motivo: 'PASARELA_TIMEOUT' })
        .mockResolvedValueOnce({ resultado: ResultadoCobro.APROBADO, referencia: 'pas_3', motivo: null }),
      reembolsar: jest.fn(),
    };
    const { srv, repo } = servicio(pasarela);

    const primera = await srv.cobrar(COBRO as any);
    expect(primera.resultado).toBe(ResultadoCobro.INDETERMINADO);

    const segunda = await srv.cobrar(COBRO as any);
    expect(pasarela.cobrar).toHaveBeenCalledTimes(2);
    expect(segunda.resultado).toBe(ResultadoCobro.APROBADO);
    expect(segunda.referencia).toBe('pas_3');
    // Y la duda quedó contada, que es lo que alimenta la reconciliación.
    expect(repo.filas.get(COBRO.claveIdempotencia).intentos).toBe(2);
  });

  it('la misma clave con otro monto se rechaza en vez de cobrar', async () => {
    const pasarela = {
      cobrar: jest.fn().mockResolvedValue({ resultado: ResultadoCobro.APROBADO, referencia: 'pas_4', motivo: null }),
      reembolsar: jest.fn(),
    };
    const { srv } = servicio(pasarela);

    await srv.cobrar(COBRO as any);
    await expect(srv.cobrar({ ...COBRO, monto: 999 } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(pasarela.cobrar).toHaveBeenCalledTimes(1);
  });

  it('un cobro y un reembolso no pueden compartir clave', async () => {
    const pasarela = {
      cobrar: jest.fn().mockResolvedValue({ resultado: ResultadoCobro.APROBADO, referencia: 'pas_5', motivo: null }),
      reembolsar: jest.fn(),
    };
    const { srv } = servicio(pasarela);

    await srv.cobrar(COBRO as any);
    await expect(
      srv.reembolsar({
        claveIdempotencia: COBRO.claveIdempotencia, solicitante: 'entradas',
        referenciaCobro: 'pas_5', monto: COBRO.monto, moneda: 'COP', motivo: 'CU-003',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(pasarela.reembolsar).not.toHaveBeenCalled();
  });

  it('guarda quién pidió el cobro, para poder auditarlo', async () => {
    const pasarela = {
      cobrar: jest.fn().mockResolvedValue({ resultado: ResultadoCobro.APROBADO, referencia: 'pas_6', motivo: null }),
      reembolsar: jest.fn(),
    };
    const { srv, repo } = servicio(pasarela);

    await srv.cobrar({ ...COBRO, solicitante: 'alimentos' } as any);
    const fila = repo.filas.get(COBRO.claveIdempotencia);
    expect(fila.solicitante).toBe('alimentos');
    expect(fila.tipo).toBe(TipoOperacion.COBRO);
  });
});
