import type { DataSource, EntityManager } from 'typeorm';
import { ConexionRabbitMq } from './conexion-rabbitmq.service';
import { EventoReferencia } from '../../persistencia/entidades/evento-referencia.entity';
import { EstadoPublicacion, PublicacionReventa } from '../../persistencia/entidades/publicacion-reventa.entity';
import type { MensajeEvento } from '../../../compartido/consumidor-eventos-gestion';
import { ClienteVentas } from '../cliente-ventas.service';
import { ConsumidorEventosPostventa } from './consumidor-eventos.service';

/** CU-026 → CU-006: el mercado secundario sigue al evento y se cierra si se cancela. */
describe('ConsumidorEventosPostventa', () => {
  const mensaje = (tipo: MensajeEvento['tipo'], versionEvento = 2): MensajeEvento => ({
    id: `msg-${versionEvento}`,
    tipo,
    versionContrato: 1,
    ocurridoEn: new Date().toISOString(),
    eventoId: 'evt-1',
    versionEvento,
    evento: {
      nombre: 'Concierto', descripcion: null, categoria: 'Música', artista: null, imagenUrl: null,
      fechaInicio: '2027-01-10T20:00:00.000Z', fechaFin: '2027-01-10T23:00:00.000Z',
      aforoMaximo: 1000, permiteReventa: true, estado: tipo === 'EVENTO_CANCELADO' ? 'CANCELADO' : 'PUBLICADO',
      lugar: 'Movistar Arena', ciudad: 'Bogotá',
    },
    localidades: [],
    ...(tipo === 'EVENTO_CANCELADO' ? { cancelacion: { motivo: 'Lluvia', requiereDevolucion: true } } : {}),
  });

  function construir(activas: Partial<PublicacionReventa>[] = []) {
    const gestor = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue({}),
      find: jest.fn().mockResolvedValue(activas),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const fuenteDatos = {
      manager: gestor,
      transaction: jest.fn((cb: (m: EntityManager) => unknown) => cb(gestor as unknown as EntityManager)),
    } as unknown as DataSource;
    const ventas = { devolverDeReventa: jest.fn().mockResolvedValue(true), comoServicio: jest.fn().mockReturnValue('servicio') };
    const consumidor = new ConsumidorEventosPostventa(fuenteDatos, ventas as unknown as ClienteVentas, {} as ConexionRabbitMq);
    return { consumidor, gestor, ventas };
  }

  it('publicado: guarda la copia con la política de reventa del evento', async () => {
    const { consumidor, gestor } = construir();
    await consumidor.aplicar(mensaje('EVENTO_PUBLICADO'));
    expect(gestor.save).toHaveBeenCalledWith(EventoReferencia, expect.objectContaining({ permiteReventa: true, versionEvento: 2 }));
    expect(gestor.find).not.toHaveBeenCalled();
  });

  it('CU-026D: al cancelar, cierra la reventa y retira las publicaciones activas', async () => {
    const { consumidor, gestor, ventas } = construir([
      { id: 'pub-1', entradaId: 'ent-1' },
      { id: 'pub-2', entradaId: 'ent-2' },
    ]);
    await consumidor.aplicar(mensaje('EVENTO_CANCELADO', 3));
    expect(gestor.save).toHaveBeenCalledWith(EventoReferencia, expect.objectContaining({ permiteReventa: false }));
    expect(gestor.update).toHaveBeenCalledWith(
      PublicacionReventa,
      { id: 'pub-1', estado: EstadoPublicacion.ACTIVA },
      expect.objectContaining({ estado: EstadoPublicacion.RETIRADA }),
    );
    expect(ventas.devolverDeReventa).toHaveBeenCalledWith('ent-1', 'servicio');
    expect(ventas.devolverDeReventa).toHaveBeenCalledWith('ent-2', 'servicio');
  });

  it('no devuelve la entrada de una publicación que se vendió entretanto', async () => {
    const { consumidor, gestor, ventas } = construir([{ id: 'pub-1', entradaId: 'ent-1' }]);
    gestor.update.mockResolvedValue({ affected: 0 });
    await consumidor.aplicar(mensaje('EVENTO_CANCELADO', 3));
    expect(ventas.devolverDeReventa).not.toHaveBeenCalled();
  });

  it('una entrega repetida de la cancelación vuelve a barrer lo que quedó activo', async () => {
    const { consumidor, gestor, ventas } = construir([{ id: 'pub-1', entradaId: 'ent-1' }]);
    gestor.findOne.mockResolvedValue({ eventoId: 'evt-1', versionEvento: 3 });
    await consumidor.aplicar(mensaje('EVENTO_CANCELADO', 3));
    expect(gestor.save).not.toHaveBeenCalled();
    expect(ventas.devolverDeReventa).toHaveBeenCalledWith('ent-1', 'servicio');
  });
});
