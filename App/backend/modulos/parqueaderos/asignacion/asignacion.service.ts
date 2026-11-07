import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ESPACIOS_ADMITIDOS, TipoVehiculo, nombreTipo } from '../comun/vehiculos';
import type { ActualizarEspacioDto } from '../dto/parqueaderos.dto';
import { OcupacionService } from '../ocupacion/ocupacion.service';
import { CONEXION_PARQUEADEROS } from '../persistencia/conexion';

/** Estados de una reserva que retienen su espacio (igual que el índice único parcial). */
export const RESERVA_ACTIVA = `('PENDIENTE_PAGO', 'PAGANDO', 'CONFIRMADA')`;

/** Un espacio está libre si está activo, sin vehículo dentro y sin reserva vigente. */
const LIBRE = `s.activo
  AND NOT EXISTS (SELECT 1 FROM estancias e WHERE e.espacio_id = s.id AND e.salida_en IS NULL)
  AND NOT EXISTS (SELECT 1 FROM reservas r WHERE r.espacio_id = s.id AND r.estado IN ${RESERVA_ACTIVA})`;

export interface Zona { id: string; nombre: string; capacidad: number; orden: number; prefijo: string }
export interface Espacio { id: string; codigo: string; tipo: TipoVehiculo; numero: number }

export interface Asignacion {
  zona: Pick<Zona, 'id' | 'nombre'>;
  espacio: Pick<Espacio, 'id' | 'codigo' | 'tipo'>;
  /** CU-023B: el espacio pedido estaba tomado y se asignó otro. */
  reasignado: boolean;
  detalle: string | null;
}

export type OrigenAsignacion = 'RESERVA' | 'INGRESO' | 'REASIGNACION' | 'LIBERACION';

/** `A-01` … `A-09`, `A-10` …: lo mismo que la migración. */
export const codigoEspacio = (prefijo: string, numero: number) => `${prefijo}-${numero < 10 ? `0${numero}` : numero}`;

/** «Zona Norte» → N, «General» → G. El organizador puede elegir otro al crear la zona. */
export const prefijoDe = (nombre: string) =>
  nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^\s*zona\s+/i, '').replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || 'Z';

/**
 * CU-023: Asignación de espacios.
 *
 * Cada zona tiene sus espacios numerados; la capacidad de la zona es cuántos
 * están activos. La asignación ocurre siempre con la **zona bloqueada**
 * (`SELECT … FOR UPDATE`, paso 5): dos solicitudes simultáneas en la misma zona
 * se atienden una detrás de otra y nunca eligen el mismo espacio. Además, dos
 * índices únicos parciales (un vehículo por espacio dentro del lote, una
 * reserva vigente por espacio) son la garantía última en la base.
 */
@Injectable()
export class AsignacionService {
  constructor(
    @InjectDataSource(CONEXION_PARQUEADEROS) private readonly datos: DataSource,
    private readonly ocupacion: OcupacionService,
  ) {}

  async bloquearZona(m: EntityManager, eventoId: string, zonaId: string): Promise<Zona> {
    const [zona] = await m.query(
      `SELECT id, nombre, capacidad, orden, prefijo FROM zonas_parqueadero WHERE id = $1 AND evento_id = $2 FOR UPDATE`, [zonaId, eventoId]);
    if (!zona) throw new NotFoundException({ codigo: 'ZONA_NO_ENCONTRADA', mensaje: 'La zona no es de este evento.' });
    return zona;
  }

  /** Pasos 2-4: el espacio libre más adecuado de una zona ya bloqueada, o null. */
  async elegir(m: EntityManager, zonaId: string, tipo: TipoVehiculo): Promise<Espacio | null> {
    const admitidos = ESPACIOS_ADMITIDOS[tipo];
    const [espacio] = await m.query(
      `SELECT s.id, s.codigo, s.tipo, s.numero FROM espacios s
        WHERE s.zona_id = $1 AND s.tipo = ANY($2::text[]) AND ${LIBRE}
        ORDER BY array_position($2::text[], s.tipo::text), s.prioridad, s.numero
        LIMIT 1`, [zonaId, admitidos]);
    return espacio ?? null;
  }

  /**
   * Pasos 1-7. Con zona, asigna dentro de ella (y si se pidió un espacio
   * concreto y ya está tomado, otro: CU-023B). Sin zona, prueba primero la
   * recomendada por el control de ocupación (CU-025, paso 7) y luego las demás
   * de la menos a la más ocupada. CU-023A: sin espacio en la zona pedida se
   * responde con una alternativa que sí lo tenga.
   */
  async asignar(m: EntityManager, eventoId: string, pedido: { zonaId?: string; tipo: TipoVehiculo; codigo?: string }): Promise<Asignacion> {
    if (pedido.zonaId) {
      const zona = await this.bloquearZona(m, eventoId, pedido.zonaId);
      let detalle: string | null = null;
      if (pedido.codigo) {
        const codigo = pedido.codigo.trim().toUpperCase();
        const [pedidoEspacio] = await m.query(
          `SELECT s.id, s.codigo, s.tipo, s.numero, (${LIBRE}) AS libre FROM espacios s WHERE s.zona_id = $1 AND upper(s.codigo) = $2`, [zona.id, codigo]);
        if (!pedidoEspacio) throw new NotFoundException({ codigo: 'ESPACIO_NO_ENCONTRADO', mensaje: `«${zona.nombre}» no tiene el espacio ${codigo}.` });
        if (pedidoEspacio.libre && ESPACIOS_ADMITIDOS[pedido.tipo].includes(pedidoEspacio.tipo)) {
          return { zona, espacio: pedidoEspacio, reasignado: false, detalle: null };
        }
        detalle = pedidoEspacio.libre
          ? `El espacio ${pedidoEspacio.codigo} no admite ${nombreTipo(pedido.tipo)}`
          : `El espacio ${pedidoEspacio.codigo} ya estaba tomado`;
      }
      const espacio = await this.elegir(m, zona.id, pedido.tipo);
      if (!espacio) {
        throw new ConflictException({
          codigo: 'ZONA_LLENA',
          mensaje: `«${zona.nombre}» no tiene espacios libres para ${nombreTipo(pedido.tipo)}.`,
          alternativa: await this.alternativa(m, eventoId, pedido.tipo, zona.id),
        });
      }
      return detalle
        ? { zona, espacio, reasignado: true, detalle: `${detalle}: se asignó ${espacio.codigo}.` }
        : { zona, espacio, reasignado: false, detalle: null };
    }

    // Todas las zonas del evento, siempre en el mismo orden: quien bloquea una
    // sola zona no espera por otra, así que no puede haber interbloqueo.
    const bloqueadas: Zona[] = await m.query(
      `SELECT id, nombre, capacidad, orden, prefijo FROM zonas_parqueadero WHERE evento_id = $1 ORDER BY id FOR UPDATE`, [eventoId]);
    const { zona: recomendada } = await this.ocupacion.recomendacion(m, eventoId);
    const preferencia = (await this.ocupacion.estadoZonas(m, eventoId))
      .sort((a, b) => Number(b.id === recomendada?.id) - Number(a.id === recomendada?.id) || a.porcentaje - b.porcentaje || a.orden - b.orden);
    for (const candidata of preferencia) {
      const espacio = await this.elegir(m, candidata.id, pedido.tipo);
      if (espacio) return { zona: bloqueadas.find((z) => z.id === candidata.id)!, espacio, reasignado: false, detalle: null };
    }
    throw new ConflictException({ codigo: 'PARQUEADERO_LLENO', mensaje: `No queda espacio para ${nombreTipo(pedido.tipo)} en ninguna zona del parqueadero.` });
  }

  /** CU-023A y CU-021A: las zonas del evento con espacio para este tipo de vehículo. */
  async conEspacio(m: EntityManager, eventoId: string, tipo: TipoVehiculo, excluirZonaId?: string) {
    return m.query(
      `SELECT z.id, z.nombre, count(s.id)::int AS disponibles
         FROM zonas_parqueadero z JOIN espacios s ON s.zona_id = z.id AND s.tipo = ANY($2::text[]) AND ${LIBRE}
        WHERE z.evento_id = $1 AND z.id IS DISTINCT FROM $3
        GROUP BY z.id ORDER BY count(s.id) DESC, z.orden, z.nombre`,
      [eventoId, ESPACIOS_ADMITIDOS[tipo], excluirZonaId ?? null]) as Promise<{ id: string; nombre: string; disponibles: number }[]>;
  }

  private async alternativa(m: EntityManager, eventoId: string, tipo: TipoVehiculo, excluirZonaId: string) {
    const [mejor] = await this.conEspacio(m, eventoId, tipo, excluirZonaId);
    if (!mejor) return null;
    const zona = (await this.ocupacion.estadoZonas(m, eventoId)).find((z) => z.id === mejor.id)!;
    return { id: zona.id, nombre: zona.nombre, disponibles: mejor.disponibles, porcentaje: zona.porcentaje };
  }

  /** Paso 8: historial de ocupación de la zona. */
  async registrar(m: EntityManager, a: {
    eventoId: string; zonaId: string; espacioId: string; origen: OrigenAsignacion; placa: string; tipo: TipoVehiculo;
    reservaId?: string | null; estanciaId?: string | null; detalle?: string | null; usuario: string;
  }) {
    await m.query(
      `INSERT INTO asignaciones_espacio (evento_id, zona_id, espacio_id, origen, placa, tipo_vehiculo, reserva_id, estancia_id, detalle, realizado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [a.eventoId, a.zonaId, a.espacioId, a.origen, a.placa, a.tipo, a.reservaId ?? null, a.estanciaId ?? null, a.detalle ?? null, a.usuario]);
  }

  // --- Espacios de cada zona (los administra el organizador) --------------------

  /** Crea los espacios de una zona nueva, numerados desde 1. */
  async crearEspacios(m: EntityManager, zona: Pick<Zona, 'id' | 'prefijo'>, desde: number, hasta: number) {
    if (hasta < desde) return;
    await m.query(
      `INSERT INTO espacios (zona_id, numero, codigo, prioridad)
       SELECT $1, n, $2 || '-' || CASE WHEN n < 10 THEN '0' || n ELSE n::text END, n FROM generate_series($3::int, $4::int) n`,
      [zona.id, zona.prefijo, desde, hasta]);
  }

  /**
   * Lleva la zona a `capacidad` espacios activos: reactiva primero los que se
   * habían retirado y numera los que falten; al bajar, retira los libres de
   * número más alto. Nunca retira uno con vehículo o reserva.
   */
  async ajustarCapacidad(m: EntityManager, zona: Zona, capacidad: number) {
    const [{ activos, maximo }] = await m.query(
      `SELECT count(*) FILTER (WHERE activo)::int AS activos, coalesce(max(numero), 0)::int AS maximo FROM espacios WHERE zona_id = $1`, [zona.id]);
    if (capacidad > activos) {
      const [, reactivados] = await m.query(
        `UPDATE espacios SET activo = true WHERE id IN (SELECT id FROM espacios WHERE zona_id = $1 AND NOT activo ORDER BY numero LIMIT $2)`,
        [zona.id, capacidad - activos]);
      await this.crearEspacios(m, zona, maximo + 1, maximo + capacidad - activos - reactivados);
    } else if (capacidad < activos) {
      const [, retirados] = await m.query(
        `UPDATE espacios SET activo = false WHERE id IN (SELECT s.id FROM espacios s WHERE s.zona_id = $1 AND ${LIBRE} ORDER BY s.numero DESC LIMIT $2)`,
        [zona.id, activos - capacidad]);
      if (retirados < activos - capacidad) {
        throw new ConflictException({ codigo: 'CAPACIDAD_MENOR_A_OCUPACION', mensaje: `«${zona.nombre}» no tiene ${activos - capacidad} espacios libres que retirar.` });
      }
    }
  }

  /** El mapa de espacios de un evento, con su estado y el vehículo o la reserva que lo ocupa. */
  espacios(eventoId: string, zonaId?: string) {
    return this.datos.query(
      `SELECT s.id, s.zona_id AS "zonaId", z.nombre AS zona, s.numero, s.codigo, s.tipo, s.prioridad, s.activo,
              CASE WHEN NOT s.activo THEN 'INACTIVO' WHEN e.id IS NOT NULL THEN 'OCUPADO' WHEN r.id IS NOT NULL THEN 'RESERVADO' ELSE 'LIBRE' END AS estado,
              coalesce(e.placa, r.placa) AS placa, e.ingreso_en AS "ingresoEn", r.id AS "reservaId"
         FROM espacios s
         JOIN zonas_parqueadero z ON z.id = s.zona_id
         LEFT JOIN estancias e ON e.espacio_id = s.id AND e.salida_en IS NULL
         LEFT JOIN reservas r ON r.espacio_id = s.id AND r.estado IN ${RESERVA_ACTIVA}
        WHERE z.evento_id = $1 AND ($2::uuid IS NULL OR z.id = $2)
        ORDER BY z.orden, z.nombre, s.numero`, [eventoId, zonaId ?? null]);
  }

  /** Cambia el tipo, la prioridad o si el espacio se usa; la capacidad de la zona lo sigue. */
  async actualizarEspacio(eventoId: string, espacioId: string, dto: ActualizarEspacioDto) {
    await this.datos.transaction(async (m) => {
      const [deZona] = await m.query(
        `SELECT s.zona_id AS "zonaId" FROM espacios s JOIN zonas_parqueadero z ON z.id = s.zona_id WHERE s.id = $1 AND z.evento_id = $2`, [espacioId, eventoId]);
      if (!deZona) throw new NotFoundException({ codigo: 'ESPACIO_NO_ENCONTRADO', mensaje: 'El espacio no es de este evento.' });
      // Con la zona bloqueada nadie asigna este espacio mientras se decide.
      await this.bloquearZona(m, eventoId, deZona.zonaId);
      const [espacio] = await m.query(
        `SELECT s.id, s.zona_id AS "zonaId", s.tipo, s.prioridad, s.activo, (${LIBRE}) OR NOT s.activo AS libre FROM espacios s WHERE s.id = $1`, [espacioId]);
      const cambiaUso = (dto.tipo !== undefined && dto.tipo !== espacio.tipo) || dto.activo === false;
      if (cambiaUso && !espacio.libre) {
        throw new ConflictException({ codigo: 'ESPACIO_EN_USO', mensaje: 'El espacio tiene un vehículo o una reserva: no se puede cambiar ahora.' });
      }
      await m.query(`UPDATE espacios SET tipo = $2, prioridad = $3, activo = $4 WHERE id = $1`,
        [espacioId, dto.tipo ?? espacio.tipo, dto.prioridad ?? espacio.prioridad, dto.activo ?? espacio.activo]);
      await m.query(`UPDATE zonas_parqueadero SET capacidad = (SELECT count(*) FROM espacios WHERE zona_id = $1 AND activo) WHERE id = $1`, [espacio.zonaId]);
      const [{ capacidad }] = await m.query(`SELECT capacidad FROM zonas_parqueadero WHERE id = $1`, [espacio.zonaId]);
      if (capacidad < 1) throw new ConflictException({ codigo: 'ZONA_SIN_ESPACIOS', mensaje: 'La zona debe conservar al menos un espacio activo.' });
    });
    return (await this.espacios(eventoId)).find((e: { id: string }) => e.id === espacioId);
  }

  /** Paso 8: el historial de asignaciones del evento, lo más reciente primero. */
  historial(eventoId: string) {
    return this.datos.query(
      `SELECT a.id, a.zona_id AS "zonaId", z.nombre AS zona, a.espacio_id AS "espacioId", s.codigo AS espacio, a.origen, a.placa,
              a.tipo_vehiculo AS "tipoVehiculo", a.reserva_id AS "reservaId", a.estancia_id AS "estanciaId", a.detalle,
              a.realizado_por AS "realizadoPor", a.fecha
         FROM asignaciones_espacio a JOIN zonas_parqueadero z ON z.id = a.zona_id JOIN espacios s ON s.id = a.espacio_id
        WHERE a.evento_id = $1 ORDER BY a.fecha DESC LIMIT 300`, [eventoId]);
  }
}
