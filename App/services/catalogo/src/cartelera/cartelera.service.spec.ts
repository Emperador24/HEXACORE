import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EstadoEvento, EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { LocalidadEvento } from '../persistencia/entidades/localidad-evento.entity';
import {
  CarteleraService,
  NINGUN_EVENTO,
  construirCondiciones,
  escaparComodines,
  validarRango,
} from './cartelera.service';
import { OrdenCartelera } from './dto/cartelera.dto';

/**
 * Reglas del CU-005 que no dependen de Postgres: la validación de filtros
 * (paso 2), qué condiciones se aplican (paso 3), el orden (paso 4), el cálculo
 * de precio y disponibilidad (pasos 5 y 8) y los caminos CU-005A y CU-005C.
 *
 * Lo que sí depende de Postgres —que el SQL sea válido, que el LATERAL sume
 * bien— se comprobó contra la base real al implementarlo; con un doble aquí
 * solo se probaría que el doble devuelve lo que se le dijo.
 */
describe('CarteleraService — CU-005', () => {
  const AHORA = new Date('2026-09-19T12:00:00Z');
  const EVENTO = 'e0000007-0000-4000-8000-000000000007';

  describe('validación del rango de fechas (paso 2)', () => {
    it('rechaza un rango al revés con 400, no con "cero resultados"', () => {
      expect(() => validarRango({ desde: '2026-12-01', hasta: '2026-10-01' })).toThrow(BadRequestException);
    });

    it('acepta un rango de un solo día: "hasta" incluye el día entero', () => {
      const rango = validarRango({ desde: '2026-10-01', hasta: '2026-10-01' });

      expect(rango.desde?.toISOString()).toBe('2026-10-01T05:00:00.000Z');
      expect(rango.hastaExclusivo?.toISOString()).toBe('2026-10-02T05:00:00.000Z');
    });

    it('interpreta una fecha sin hora como medianoche en Colombia, no en Greenwich', () => {
      // Medianoche en Bogotá son las 05:00 UTC. Con la medianoche UTC, un
      // evento del 30 a las 8 p. m. hora local caería en el día 1.
      expect(validarRango({ desde: '2026-10-01' }).desde?.toISOString()).toBe('2026-10-01T05:00:00.000Z');
    });

    it('respeta un instante exacto cuando se da con hora', () => {
      const rango = validarRango({ hasta: '2026-10-01T18:30:00-05:00' });

      expect(rango.hastaExclusivo?.toISOString()).toBe('2026-10-01T23:30:00.000Z');
    });
  });

  describe('condiciones de la consulta (paso 3)', () => {
    it('sin filtros solo exige publicado y futuro (CU-005A)', () => {
      const { where, parametros } = construirCondiciones({}, {}, AHORA);

      expect(where).toBe('ev.estado = $1 AND ev.fecha_inicio > $2');
      expect(parametros).toEqual([EstadoEvento.PUBLICADO, AHORA]);
    });

    it('con incluirPasados deja de exigir que sea futuro', () => {
      const { where } = construirCondiciones({ incluirPasados: true }, {}, AHORA);

      expect(where).toBe('ev.estado = $1');
    });

    it('nunca pega el valor del usuario en el SQL: viaja como parámetro', () => {
      const malicioso = "Bogotá' OR '1'='1";
      const { where, parametros } = construirCondiciones({ ciudad: malicioso }, {}, AHORA);

      expect(where).not.toContain(malicioso);
      expect(where).toContain('lower(ev.ciudad) = lower($3)');
      expect(parametros[2]).toBe(malicioso);
    });

    it('busca el artista por coincidencia parcial', () => {
      const { where, parametros } = construirCondiciones({ artista: 'niche' }, {}, AHORA);

      expect(where).toContain('ev.artista ILIKE $3');
      expect(parametros[2]).toBe('%niche%');
    });

    it('numera los parámetros en orden cuando se combinan filtros', () => {
      const rango = validarRango({ desde: '2026-10-01', hasta: '2026-10-31' });
      const { where, parametros } = construirCondiciones({ categoria: 'Teatro', ciudad: 'Cali' }, rango, AHORA);

      expect(where).toBe(
        'ev.estado = $1 AND ev.fecha_inicio > $2 AND lower(ev.categoria) = lower($3) AND ' +
          'lower(ev.ciudad) = lower($4) AND ev.fecha_inicio >= $5 AND ev.fecha_inicio < $6',
      );
      expect(parametros).toHaveLength(6);
    });
  });

  describe('escape de comodines en la búsqueda por artista', () => {
    it.each([
      ['50%', '50\\%'],
      ['a_b', 'a\\_b'],
      ['c\\d', 'c\\\\d'],
      ['Grupo Niche', 'Grupo Niche'],
    ])('%s → %s', (entrada, esperado) => {
      expect(escaparComodines(entrada)).toBe(esperado);
    });
  });

  describe('listar', () => {
    /** Doble de la base: la primera consulta es el listado y la segunda el conteo. */
    function servicioQueDevuelve(filas: unknown[], total: number) {
      const query = jest.fn().mockResolvedValueOnce(filas).mockResolvedValueOnce([{ total }]);
      return { servicio: new CarteleraService({ query } as unknown as DataSource), query };
    }

    const fila = (cambios: Record<string, unknown> = {}) => ({
      evento_id: EVENTO,
      nombre: 'Clásico del Fútbol Colombiano',
      artista: null,
      categoria: 'Deportes',
      fecha_inicio: new Date(Date.now() + 36 * 24 * 60 * 60 * 1000),
      fecha_fin: null,
      lugar: 'Estadio Atanasio Girardot',
      ciudad: 'Medellín',
      imagen_url: null,
      // Postgres entrega numeric y bigint como texto.
      precio_desde: '130000.00',
      disponibles: '900',
      ...cambios,
    });

    it('trae "Ningún evento encontrado" cuando no hay resultados (CU-005C)', async () => {
      const { servicio } = servicioQueDevuelve([], 0);

      const resultado = await servicio.listar({ categoria: 'Circo' });

      expect(resultado.eventos).toEqual([]);
      expect(resultado.mensaje).toBe(NINGUN_EVENTO);
    });

    it('no trae mensaje cuando sí hay resultados', async () => {
      const { servicio } = servicioQueDevuelve([fila()], 1);

      expect((await servicio.listar({})).mensaje).toBeNull();
    });

    it('convierte las cifras de texto a número', async () => {
      const { servicio } = servicioQueDevuelve([fila()], 1);

      const [evento] = (await servicio.listar({})).eventos;

      expect(evento.precioDesde).toBe(130000);
      expect(evento.agotado).toBe(false);
    });

    it('marca agotado un evento con localidades pero sin cupo', async () => {
      const { servicio } = servicioQueDevuelve([fila({ disponibles: '0' })], 1);

      expect((await servicio.listar({})).eventos[0].agotado).toBe(true);
    });

    it('no marca agotado un evento que aún no tiene localidades: todavía no está a la venta', async () => {
      const { servicio } = servicioQueDevuelve([fila({ disponibles: null, precio_desde: null })], 1);

      const [evento] = (await servicio.listar({})).eventos;

      expect(evento.agotado).toBe(false);
      expect(evento.precioDesde).toBeNull();
    });

    it('pagina con 20 por defecto y pasa límite y desplazamiento como parámetros', async () => {
      const { servicio, query } = servicioQueDevuelve([], 0);

      const resultado = await servicio.listar({});

      expect(resultado.limite).toBe(20);
      expect(resultado.desplazamiento).toBe(0);
      const [sql, parametros] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('LIMIT $3 OFFSET $4');
      expect(parametros.slice(-2)).toEqual([20, 0]);
    });

    it.each([
      [undefined, 'ORDER BY ev.fecha_inicio ASC, ev.evento_id ASC'],
      [OrdenCartelera.FECHA, 'ORDER BY ev.fecha_inicio ASC, ev.evento_id ASC'],
      [OrdenCartelera.RELEVANCIA, 'ORDER BY l.ocupacion DESC NULLS LAST'],
    ])('orden %s → %s (paso 4)', async (orden, esperado) => {
      const { servicio, query } = servicioQueDevuelve([], 0);

      await servicio.listar({ orden });

      expect((query.mock.calls[0] as [string])[0].replace(/\s+/g, ' ')).toContain(esperado);
    });

    it('no consulta la base si el rango de fechas es inválido', async () => {
      const { servicio, query } = servicioQueDevuelve([], 0);

      await expect(servicio.listar({ desde: '2026-12-01', hasta: '2026-10-01' })).rejects.toThrow(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('filtros disponibles', () => {
    it('devuelve categorías y ciudades de los eventos publicados y futuros', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce([{ valor: 'Conciertos' }, { valor: 'Teatro' }])
        .mockResolvedValueOnce([{ valor: 'Bogotá' }, { valor: 'Cali' }]);
      const servicio = new CarteleraService({ query } as unknown as DataSource);

      const filtros = await servicio.filtros();

      expect(filtros).toEqual({ categorias: ['Conciertos', 'Teatro'], ciudades: ['Bogotá', 'Cali'] });
      for (const [sql, parametros] of query.mock.calls as [string, unknown[]][]) {
        expect(sql).toContain('estado = $1 AND fecha_inicio > $2');
        expect(parametros[0]).toBe(EstadoEvento.PUBLICADO);
      }
    });
  });

  describe('detalle (pasos 6-8)', () => {
    function servicioCon(evento: Partial<EventoReferencia> | null, localidades: Partial<LocalidadEvento>[]) {
      const findOne = jest.fn().mockResolvedValue(evento);
      const find = jest.fn().mockResolvedValue(localidades);
      return { servicio: new CarteleraService({ manager: { findOne, find } } as unknown as DataSource), findOne };
    }

    const evento = (cambios: Partial<EventoReferencia> = {}): Partial<EventoReferencia> => ({
      eventoId: EVENTO,
      nombre: 'Clásico del Fútbol Colombiano',
      artista: null,
      categoria: 'Deportes',
      fechaInicio: new Date(Date.now() + 36 * 24 * 60 * 60 * 1000),
      fechaFin: null,
      lugar: 'Estadio Atanasio Girardot',
      ciudad: 'Medellín',
      imagenUrl: null,
      descripcion: 'El partido más esperado',
      estado: EstadoEvento.PUBLICADO,
      ...cambios,
    });

    const localidad = (nombre: string, precio: number, aforo: number, vendidas: number): Partial<LocalidadEvento> => ({
      localidadId: `id-${nombre}`,
      eventoId: EVENTO,
      nombre,
      precio,
      aforo,
      vendidas,
      reservadas: 0,
    });

    it('solo busca eventos publicados', async () => {
      const { servicio, findOne } = servicioCon(evento(), []);

      await servicio.detalle(EVENTO);

      expect(findOne).toHaveBeenCalledWith(EventoReferencia, {
        where: { eventoId: EVENTO, estado: EstadoEvento.PUBLICADO },
      });
    });

    it('responde 404 si no existe o no está publicado', async () => {
      const { servicio } = servicioCon(null, []);

      await expect(servicio.detalle(EVENTO)).rejects.toThrow(NotFoundException);
    });

    it('calcula la disponibilidad de cada localidad como aforo menos vendidas', async () => {
      const { servicio } = servicioCon(evento(), [
        localidad('Norte', 55000, 12000, 12000),
        localidad('Occidental', 130000, 8000, 7100),
      ]);

      const detalle = await servicio.detalle(EVENTO);

      expect(detalle.localidades).toEqual([
        { id: 'id-Norte', nombre: 'Norte', precio: 55000, disponibles: 0, agotada: true },
        { id: 'id-Occidental', nombre: 'Occidental', precio: 130000, disponibles: 900, agotada: false },
      ]);
      expect(detalle.disponiblesTotal).toBe(900);
    });

    it('el "desde" es la localidad más barata con cupo, no la más barata agotada', async () => {
      const { servicio } = servicioCon(evento(), [
        localidad('Norte', 55000, 12000, 12000),
        localidad('Occidental', 130000, 8000, 7100),
      ]);

      expect((await servicio.detalle(EVENTO)).precioDesde).toBe(130000);
    });

    it('si todo está agotado, marca agotado y el "desde" es el más barato', async () => {
      const { servicio } = servicioCon(evento(), [localidad('General', 60000, 4000, 4000)]);

      const detalle = await servicio.detalle(EVENTO);

      expect(detalle.agotado).toBe(true);
      expect(detalle.precioDesde).toBe(60000);
    });

    it('un evento sin localidades no está agotado y no tiene precio', async () => {
      const { servicio } = servicioCon(evento(), []);

      const detalle = await servicio.detalle(EVENTO);

      expect(detalle.agotado).toBe(false);
      expect(detalle.precioDesde).toBeNull();
    });

    it('marca pasado un evento que ya empezó', async () => {
      const { servicio } = servicioCon(evento({ fechaInicio: new Date(Date.now() - 60_000) }), []);

      expect((await servicio.detalle(EVENTO)).pasado).toBe(true);
    });
  });
});
