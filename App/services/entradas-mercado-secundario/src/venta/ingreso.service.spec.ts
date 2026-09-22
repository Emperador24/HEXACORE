import { createHash } from 'node:crypto';
import { baseDatosFalsa } from '../../test/dobles/base-datos';
import { Entrada, EstadoEntrada } from '../persistencia/entidades/entrada.entity';
import { EstadoEvento, EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { Ingreso, OrigenIngreso } from '../persistencia/entidades/ingreso.entity';
import { Contadores } from './contadores';
import { IngresoService, hashQr } from './ingreso.service';
import { AforoCompleto, QrInvalido, QrYaUtilizado } from './venta.errors';

/** CU-002: validar un QR en la puerta, con sus caminos alternos y el modo sin conexión. */
describe('IngresoService — CU-002', () => {
  const PERSONAL = 'b0000009-0000-4000-8000-000000000009';
  const EVENTO = 'e0000001-0000-4000-8000-000000000001';

  const entrada = (cambios: Partial<Entrada> = {}): Entrada =>
    ({ id: 'ent-1', eventoId: EVENTO, codigoQr: 'HXC-QR-abc', numeroTicket: 'TCK-1', localidadNombre: 'General', estado: EstadoEntrada.VALIDA, ...cambios }) as Entrada;

  function construir(opciones: { entrada?: Entrada | null; evento?: Partial<EventoReferencia> | null; ingresoPrevio?: Partial<Ingreso> } = {}) {
    const { gestor, fuenteDatos } = baseDatosFalsa();
    gestor.findOne.mockImplementation((entidad: unknown) => {
      if (entidad === EventoReferencia) {
        return Promise.resolve(
          opciones.evento === null
            ? null
            : { eventoId: EVENTO, nombre: 'HEXACORE Fest', estado: EstadoEvento.PUBLICADO, asistentes: 10, aforoMaximo: null, ...opciones.evento },
        );
      }
      if (entidad === Entrada) return Promise.resolve(opciones.entrada === undefined ? entrada() : opciones.entrada);
      if (entidad === Ingreso) return Promise.resolve(opciones.ingresoPrevio ?? null);
      return Promise.resolve(null);
    });
    const contadores = { sumarAsistente: jest.fn().mockResolvedValue(true) };
    const servicio = new IngresoService(fuenteDatos, contadores as unknown as Contadores);
    return { servicio, gestor, contadores };
  }

  const escanear = (servicio: IngresoService, codigoQr = 'HXC-QR-abc') =>
    servicio.validar(PERSONAL, { eventoId: EVENTO, codigoQr, puntoAcceso: 'Puerta 3' });

  it('pasos 2-10: marca el QR como usado, suma al aforo, registra la hora y autoriza', async () => {
    const { servicio, gestor, contadores } = construir();

    const resultado = await escanear(servicio);

    expect(gestor.update).toHaveBeenCalledWith(Entrada, { id: 'ent-1', estado: EstadoEntrada.VALIDA }, { estado: EstadoEntrada.USADA });
    expect(contadores.sumarAsistente).toHaveBeenCalledWith(gestor, EVENTO);
    expect(gestor.create).toHaveBeenCalledWith(Ingreso, expect.objectContaining({ validadoPor: PERSONAL, puntoAcceso: 'Puerta 3', origen: OrigenIngreso.EN_LINEA }));
    expect(resultado).toMatchObject({ autorizado: true, numeroTicket: 'TCK-1', asistentes: 11 });
  });

  it.each([
    ['un QR que no existe', { entrada: null }],
    ['el QR de otro evento', { entrada: entrada({ eventoId: 'otro' }) }],
    ['una entrada anulada', { entrada: entrada({ estado: EstadoEntrada.ANULADA }) }],
    ['una entrada publicada en reventa', { entrada: entrada({ estado: EstadoEntrada.EN_REVENTA }) }],
    ['un evento cancelado', { evento: { estado: EstadoEvento.CANCELADO } }],
    ['un evento que no existe', { evento: null }],
  ])('CU-002A: rechaza %s', async (_caso, opciones) => {
    const { servicio, gestor } = construir(opciones);

    await expect(escanear(servicio)).rejects.toThrow(QrInvalido);
    expect(gestor.update).not.toHaveBeenCalled();
  });

  it('CU-002D: una entrada ya usada se rechaza, diciendo cuándo y por dónde entró', async () => {
    const primera = new Date('2026-12-18T19:00:00Z');
    const { servicio } = construir({ entrada: entrada({ estado: EstadoEntrada.USADA }), ingresoPrevio: { escaneadoEn: primera, puntoAcceso: 'Puerta 1' } });

    await expect(escanear(servicio)).rejects.toMatchObject({
      response: { codigo: 'CU-002D', primerIngreso: primera.toISOString(), puntoAcceso: 'Puerta 1' },
    });
  });

  it('CU-002D bajo concurrencia: otra puerta la marcó entre la lectura y el UPDATE', async () => {
    const { servicio, gestor, contadores } = construir();
    gestor.update.mockResolvedValue({ affected: 0 });

    await expect(escanear(servicio)).rejects.toThrow(QrYaUtilizado);
    expect(contadores.sumarAsistente).not.toHaveBeenCalled();
  });

  it('CU-002B: con el aforo lleno, niega el ingreso y sugiere la zona de espera', async () => {
    const { servicio, contadores } = construir({ evento: { aforoMaximo: 120, asistentes: 120 } });
    contadores.sumarAsistente.mockResolvedValue(false);

    await expect(escanear(servicio)).rejects.toThrow(AforoCompleto);
    await expect(escanear(servicio)).rejects.toMatchObject({ response: { sugerencia: expect.stringContaining('zona de espera') } });
  });

  it('CU-002E: la caché lleva hashes, nunca los códigos', async () => {
    const { servicio, gestor } = construir();
    gestor.find.mockResolvedValue([entrada()]);

    const cache = await servicio.cache(EVENTO);

    expect(cache.validos).toEqual([{ hash: createHash('sha256').update('HXC-QR-abc').digest('hex'), numeroTicket: 'TCK-1', localidadNombre: 'General' }]);
    expect(JSON.stringify(cache)).not.toContain('HXC-QR-abc');
    expect(hashQr('HXC-QR-abc')).toHaveLength(64);
  });

  it('CU-002E: sincroniza en orden de escaneo y devuelve los conflictos en vez de perderlos', async () => {
    const { servicio, gestor } = construir();
    // El segundo escaneo del mismo QR ya no lo encuentra VALIDA.
    gestor.update.mockResolvedValueOnce({ affected: 1 }).mockResolvedValueOnce({ affected: 0 });

    const resultado = await servicio.sincronizar(PERSONAL, {
      eventoId: EVENTO,
      ingresos: [
        { codigoQr: 'HXC-QR-abc', escaneadoEn: '2026-12-18T19:05:00Z' },
        { codigoQr: 'HXC-QR-abc', escaneadoEn: '2026-12-18T19:00:00Z' },
      ],
    });

    expect(resultado).toMatchObject({ registrados: 1, conflictos: 1 });
    expect(resultado.resultados.map((r) => r.resultado)).toEqual(['REGISTRADO', 'CU-002D']);
    // El que cuenta es el primero en el tiempo, no el primero en la lista.
    expect(gestor.create).toHaveBeenCalledWith(Ingreso, expect.objectContaining({ origen: OrigenIngreso.SINCRONIZADO, escaneadoEn: new Date('2026-12-18T19:00:00Z') }));
  });

  it('CU-002E: un error que no es de negocio no se disfraza de conflicto', async () => {
    const { servicio, gestor } = construir();
    gestor.findOne.mockRejectedValue(new Error('se cayó la base'));

    await expect(
      servicio.sincronizar(PERSONAL, { eventoId: EVENTO, ingresos: [{ codigoQr: 'HXC-QR-abc', escaneadoEn: '2026-12-18T19:00:00Z' }] }),
    ).rejects.toThrow('se cayó la base');
  });
});
