import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { EntityManager } from 'typeorm';
import { ConexionRabbitMq } from '../../../compartido/rabbitmq/conexion-rabbitmq.service';
import {
  ConsumidorEventosGestion,
  MensajeEvento,
  esMensajeEvento,
  estadoDe,
  guardarCopiaEvento,
} from './consumidor-eventos-gestion';
import { MAXIMO_INTENTOS } from './eventos-reventa';

/** Consumidores de `eventos.gestion` (CU-026 → Boletería). */
describe('ConsumidorEventosGestion', () => {
  const mensaje = (cambios: Partial<MensajeEvento> = {}): MensajeEvento => ({
    id: 'msg-1',
    tipo: 'EVENTO_PUBLICADO',
    versionContrato: 1,
    ocurridoEn: new Date().toISOString(),
    eventoId: 'evt-1',
    versionEvento: 2,
    evento: {
      nombre: 'Concierto', descripcion: null, categoria: 'Música', artista: null, imagenUrl: null,
      fechaInicio: '2027-01-10T20:00:00.000Z', fechaFin: '2027-01-10T23:00:00.000Z',
      aforoMaximo: 1000, permiteReventa: true, estado: 'PUBLICADO', lugar: 'Movistar Arena', ciudad: 'Bogotá',
    },
    localidades: [{ localidadId: 'loc-1', nombre: 'General', precio: 80000, cantidad: 800, orden: 0 }],
    ...cambios,
  });

  describe('esMensajeEvento', () => {
    it('acepta un mensaje del contrato v1', () => expect(esMensajeEvento(mensaje())).toBe(true));
    it.each([
      ['otra versión del contrato', { versionContrato: 2 }],
      ['un tipo desconocido', { tipo: 'EVENTO_BORRADO' }],
      ['sin versión del evento', { versionEvento: undefined }],
      ['sin localidades', { localidades: undefined }],
    ])('rechaza %s', (_caso, cambios) => {
      expect(esMensajeEvento({ ...mensaje(), ...cambios })).toBe(false);
    });
    it('rechaza lo que no es un objeto', () => expect(esMensajeEvento(null)).toBe(false));
  });

  it('estadoDe: una cancelación manda sobre el estado del cuerpo', () => {
    expect(estadoDe(mensaje())).toBe('PUBLICADO');
    expect(estadoDe(mensaje({ tipo: 'EVENTO_CANCELADO' }))).toBe('CANCELADO');
  });

  describe('guardarCopiaEvento', () => {
    class Copia { eventoId: string; versionEvento: number; nombre: string }
    const gestor = (actual: Partial<Copia> | null) => ({
      findOne: jest.fn().mockResolvedValue(actual),
      save: jest.fn().mockResolvedValue({}),
    });

    it('crea la copia si no existía', async () => {
      const m = gestor(null);
      await expect(guardarCopiaEvento(m as unknown as EntityManager, Copia, mensaje(), { nombre: 'Concierto' })).resolves.toBe(true);
      expect(m.save).toHaveBeenCalledWith(Copia, { nombre: 'Concierto', eventoId: 'evt-1', versionEvento: 2 });
    });

    it('aplica una versión más nueva', async () => {
      const m = gestor({ eventoId: 'evt-1', versionEvento: 1, nombre: 'Viejo' });
      await expect(guardarCopiaEvento(m as unknown as EntityManager, Copia, mensaje(), { nombre: 'Nuevo' })).resolves.toBe(true);
      expect(m.save).toHaveBeenCalledWith(Copia, expect.objectContaining({ nombre: 'Nuevo', versionEvento: 2 }));
    });

    it.each([2, 3])('descarta un mensaje repetido o atrasado (copia en versión %i)', async (version) => {
      const m = gestor({ eventoId: 'evt-1', versionEvento: version, nombre: 'Actual' });
      await expect(guardarCopiaEvento(m as unknown as EntityManager, Copia, mensaje(), { nombre: 'Otro' })).resolves.toBe(false);
      expect(m.save).not.toHaveBeenCalled();
    });

    it('bloquea la fila mientras decide', async () => {
      const m = gestor(null);
      await guardarCopiaEvento(m as unknown as EntityManager, Copia, mensaje(), {});
      expect(m.findOne).toHaveBeenCalledWith(Copia, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    });
  });

  describe('entrega', () => {
    class DePrueba extends ConsumidorEventosGestion {
      protected readonly cola = 'prueba.eventos';
      aplicar = jest.fn().mockResolvedValue(undefined);
    }
    const canal = () => ({ ack: jest.fn(), nack: jest.fn() });
    const entregar = (consumidor: DePrueba, c: ReturnType<typeof canal>, cuerpo: unknown) =>
      (consumidor as unknown as { recibir(c: ConfirmChannel, m: ConsumeMessage): Promise<void> }).recibir(
        c as unknown as ConfirmChannel,
        { content: Buffer.from(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) } as ConsumeMessage,
      );
    const nuevo = () => new DePrueba({} as ConexionRabbitMq);

    it('aplica y confirma', async () => {
      const consumidor = nuevo();
      const c = canal();
      const evento = mensaje();
      await entregar(consumidor, c, evento);
      expect(consumidor.aplicar).toHaveBeenCalledWith(evento);
      expect(c.ack).toHaveBeenCalled();
    });

    it('un mensaje ilegible va directo a la DLQ, sin aplicar', async () => {
      const consumidor = nuevo();
      const c = canal();
      await entregar(consumidor, c, '{no es json');
      expect(consumidor.aplicar).not.toHaveBeenCalled();
      expect(c.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    });

    it(`reintenta un fallo y a los ${MAXIMO_INTENTOS} intentos lo manda a la DLQ`, async () => {
      const consumidor = nuevo();
      consumidor.aplicar.mockRejectedValue(new Error('base caída'));
      const c = canal();
      for (let i = 0; i < MAXIMO_INTENTOS; i++) await entregar(consumidor, c, mensaje());
      expect(c.nack.mock.calls.map((llamada) => llamada[2])).toEqual([...Array(MAXIMO_INTENTOS - 1).fill(true), false]);
    });
  });
});
