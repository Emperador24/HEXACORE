import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EstadoEvento, EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { LocalidadEvento } from '../persistencia/entidades/localidad-evento.entity';
import {
  CarteleraDto,
  ConsultarCarteleraDto,
  EventoDetalleDto,
  EventoResumenDto,
  FiltrosCarteleraDto,
  OrdenCartelera,
} from './dto/cartelera.dto';

// CU-005C
export const NINGUN_EVENTO = 'Ningún evento encontrado';

const DESFASE_COLOMBIA = '-05:00';
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const UN_DIA_MS = 24 * 60 * 60 * 1000;

//consulta 
interface FilaCartelera {
  evento_id: string;
  nombre: string;
  artista: string | null;
  categoria: string;
  fecha_inicio: Date;
  fecha_fin: Date | null;
  lugar: string;
  ciudad: string;
  imagen_url: string | null;
  precio_desde: string | null;
  disponibles: string | null;
}

// Rango onvertido a instantes
interface RangoFechas {
  desde?: Date;
  hastaExclusivo?: Date;
}

//Cartelera de eventos CU-005: listar con filtros y detallar. solo lectura

@Injectable()
export class CarteleraService {
  private readonly log = new Logger(CarteleraService.name);

  constructor(@InjectDataSource() private readonly fuenteDatos: DataSource) {}

  // sin filtros, se filtra por fecha y sin resultados se da un mensaje
  async listar(filtros: ConsultarCarteleraDto): Promise<CarteleraDto> {
    const rango = validarRango(filtros);
    const limite = filtros.limite ?? 20;
    const desplazamiento = filtros.desplazamiento ?? 0;

    const { where, parametros } = construirCondiciones(filtros, rango, new Date());
    const orden = ordenSql(filtros.orden ?? OrdenCartelera.FECHA);


    const filas: FilaCartelera[] = await this.fuenteDatos.query(
      `
      SELECT ev.evento_id, ev.nombre, ev.artista, ev.categoria, ev.fecha_inicio, ev.fecha_fin,
             ev.lugar, ev.ciudad, ev.imagen_url,
             COALESCE(l.precio_con_cupo, l.precio_minimo) AS precio_desde,
             l.disponibles
        FROM eventos_referencia ev
        LEFT JOIN LATERAL (
          SELECT MIN(precio) FILTER (WHERE vendidas + reservadas < aforo) AS precio_con_cupo,
                 MIN(precio) AS precio_minimo,
                 SUM(aforo - vendidas - reservadas) AS disponibles,
                 SUM(vendidas)::float / NULLIF(SUM(aforo), 0) AS ocupacion
            FROM localidades_evento
           WHERE evento_id = ev.evento_id
        ) l ON true
       WHERE ${where}
       ORDER BY ${orden}
       LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}
      `,
      [...parametros, limite, desplazamiento],
    );

    const [{ total }] = (await this.fuenteDatos.query(
      `SELECT COUNT(*)::int AS total FROM eventos_referencia ev WHERE ${where}`,
      parametros,
    )) as { total: number }[];

    // cartelera publica
    this.log.log(`Consulta de cartelera ${JSON.stringify(filtros)} → ${total} eventos`);

    const ahora = Date.now();
    return {
      eventos: filas.map((fila) => aResumen(fila, ahora)),
      total,
      limite,
      desplazamiento,
      mensaje: total === 0 ? NINGUN_EVENTO : null,
    };
  }

  // detalle con localidades, precios y disponibilidad
  async detalle(eventoId: string): Promise<EventoDetalleDto> {
    const evento = await this.fuenteDatos.manager.findOne(EventoReferencia, {
      where: { eventoId, estado: EstadoEvento.PUBLICADO },
    });
    // Un borrador o un cancelado  igual que uno inexistente
    if (!evento) {
      throw new NotFoundException({ codigo: 'EVENTO_NO_ENCONTRADO', mensaje: 'El evento no existe o no está publicado' });
    }

    const localidades = await this.fuenteDatos.manager.find(LocalidadEvento, {
      where: { eventoId },
      order: { orden: 'ASC', precio: 'ASC' },
    });

    const detalleLocalidades = localidades.map((l) => {
      // reservado por compras sin pagar no esta disponible
      const disponibles = l.aforo - l.vendidas - l.reservadas;
      return { id: l.localidadId, nombre: l.nombre, precio: l.precio, disponibles, agotada: disponibles === 0 };
    })
    const conCupo = detalleLocalidades.filter((l) => !l.agotada);
    const disponiblesTotal = conCupo.reduce((suma, l) => suma + l.disponibles, 0);
    const precios = (conCupo.length > 0 ? conCupo : detalleLocalidades).map((l) => l.precio);

    return {
      id: evento.eventoId,
      nombre: evento.nombre,
      artista: evento.artista,
      categoria: evento.categoria,
      fechaInicio: evento.fechaInicio.toISOString(),
      fechaFin: evento.fechaFin?.toISOString() ?? null,
      lugar: evento.lugar,
      ciudad: evento.ciudad,
      imagenUrl: evento.imagenUrl,
      descripcion: evento.descripcion,
      precioDesde: precios.length > 0 ? Math.min(...precios) : null,
      agotado: detalleLocalidades.length > 0 && disponiblesTotal === 0,
      pasado: evento.fechaInicio.getTime() <= Date.now(),
      localidades: detalleLocalidades,
      disponiblesTotal,
    };
  }

  // categorias y ciudades para los desplegables del portal
  // solo de eventos que se listan
  async filtros(): Promise<FiltrosCarteleraDto> {
    const condicion = `estado = $1 AND fecha_inicio > $2`;
    const parametros = [EstadoEvento.PUBLICADO, new Date()];
    const [categorias, ciudades] = await Promise.all([
      this.fuenteDatos.query(
        `SELECT DISTINCT categoria AS valor FROM eventos_referencia WHERE ${condicion} ORDER BY 1`,
        parametros,
      ) as Promise<{ valor: string }[]>,
      this.fuenteDatos.query(
        `SELECT DISTINCT ciudad AS valor FROM eventos_referencia WHERE ${condicion} ORDER BY 1`,
        parametros,
      ) as Promise<{ valor: string }[]>,
    ]);
    return { categorias: categorias.map((f) => f.valor), ciudades: ciudades.map((f) => f.valor) };
  }
}

// error en la busqueda
export function validarRango(filtros: Pick<ConsultarCarteleraDto, 'desde' | 'hasta'>): RangoFechas {
  const desde = filtros.desde ? inicioDe(filtros.desde) : undefined;
  const hastaExclusivo = filtros.hasta ? finExclusivoDe(filtros.hasta) : undefined;

  if (desde && hastaExclusivo && desde >= hastaExclusivo) {
    throw new BadRequestException({
      codigo: 'RANGO_FECHAS_INVALIDO',
      mensaje: 'La fecha "desde" debe ser anterior a la fecha "hasta"',
    });
  }
  return { desde, hastaExclusivo };
}

function inicioDe(fecha: string): Date {
  return new Date(SOLO_FECHA.test(fecha) ? `${fecha}T00:00:00${DESFASE_COLOMBIA}` : fecha);
}

function finExclusivoDe(fecha: string): Date {
  if (!SOLO_FECHA.test(fecha)) return new Date(fecha);
  return new Date(inicioDe(fecha).getTime() + UN_DIA_MS);
}

// arma el WHERE con **parámetros** ($1, $2…) para impedir inyección SQL

export function construirCondiciones(
  filtros: ConsultarCarteleraDto,
  rango: RangoFechas,
  ahora: Date,
): { where: string; parametros: unknown[] } {
  const condiciones: string[] = [];
  const parametros: unknown[] = [];
  const agregar = (condicion: (n: string) => string, valor: unknown): void => {
    parametros.push(valor);
    condiciones.push(condicion(`$${parametros.length}`));
  };

  agregar((n) => `ev.estado = ${n}`, EstadoEvento.PUBLICADO);
  if (!filtros.incluirPasados) agregar((n) => `ev.fecha_inicio > ${n}`, ahora);
  if (filtros.categoria) agregar((n) => `lower(ev.categoria) = lower(${n})`, filtros.categoria);
  if (filtros.ciudad) agregar((n) => `lower(ev.ciudad) = lower(${n})`, filtros.ciudad);
  if (filtros.artista) agregar((n) => `ev.artista ILIKE ${n}`, `%${escaparComodines(filtros.artista)}%`);
  if (rango.desde) agregar((n) => `ev.fecha_inicio >= ${n}`, rango.desde);
  if (rango.hastaExclusivo) agregar((n) => `ev.fecha_inicio < ${n}`, rango.hastaExclusivo);

  return { where: condiciones.join(' AND '), parametros };
}

/**
 * `%` y `_` comodines para evitar que el texto del usuario cambie el patron.
 */
export function escaparComodines(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

//terminar en evento_id para evitar duplicidad entre paginas
function ordenSql(orden: OrdenCartelera): string {
  return orden === OrdenCartelera.RELEVANCIA
    ? 'l.ocupacion DESC NULLS LAST, ev.fecha_inicio ASC, ev.evento_id ASC'
    : 'ev.fecha_inicio ASC, ev.evento_id ASC';
}

function aResumen(fila: FilaCartelera, ahora: number): EventoResumenDto {
  // disponibles = null cuando el evento aun no esta a la venta
  const agotado = fila.disponibles !== null && Number(fila.disponibles) === 0;
  return {
    id: fila.evento_id,
    nombre: fila.nombre,
    artista: fila.artista,
    categoria: fila.categoria,
    fechaInicio: fila.fecha_inicio.toISOString(),
    fechaFin: fila.fecha_fin?.toISOString() ?? null,
    lugar: fila.lugar,
    ciudad: fila.ciudad,
    imagenUrl: fila.imagen_url,
    precioDesde: fila.precio_desde === null ? null : Number(fila.precio_desde),
    agotado,
    pasado: fila.fecha_inicio.getTime() <= ahora,
  };
}
