import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { EventosService } from '../../eventos-recintos/eventos/eventos.service';
import { CONEXION_OPERACION } from '../persistencia/conexion';
import {
  AsignarResponsableDto,
  CerrarIncidenteDto,
  EstadoIncidente,
  PrioridadIncidente,
  ReclasificarPrioridadDto,
  RegistrarIncidenteDto,
  ReportarAvanceDto,
} from './dto/incidentes.dto';
import { NotificadorIncidentes } from './notificador-incidentes.service';

export interface FilaIncidente {
  id: string; eventoId: string; tipo: string; ubicacion: string; descripcion: string;
  prioridad: PrioridadIncidente; estado: EstadoIncidente; reportadoPor: string;
  responsableId: string | null; asignadoPor: string | null; asignadoEn: Date | null;
  notaResolucion: string | null; cerradoPor: string | null; cerradoEn: Date | null;
  creadoEn: Date; actualizadoEn: Date;
}

const COLUMNAS = `id, evento_id AS "eventoId", tipo, ubicacion, descripcion, prioridad, estado,
  reportado_por AS "reportadoPor", responsable_id AS "responsableId", asignado_por AS "asignadoPor",
  asignado_en AS "asignadoEn", nota_resolucion AS "notaResolucion", cerrado_por AS "cerradoPor",
  cerrado_en AS "cerradoEn", creado_en AS "creadoEn", actualizado_en AS "actualizadoEn"`;

/** Orden de atención (CU-020A): un CRÍTICO siempre antes que un ALTA, etc. */
const ORDEN_PRIORIDAD: Record<PrioridadIncidente, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };

/** Palabras que, en el tipo del incidente, suben su prioridad inicial (paso 2). */
const PALABRAS_CRITICAS = ['incendio', 'fuego', 'explosi', 'médic', 'medic', 'estructural', 'derrumb', 'arma', 'evacua'];
const PALABRAS_ALTAS = ['robo', 'violencia', 'altercado', 'pelea', 'intoxica', 'herid', 'hurto'];
const PALABRAS_BAJAS = ['menor', 'leve', 'objeto perdido', 'extravi'];

/** Paso 2: el sistema asigna un nivel de prioridad inicial según el tipo reportado. */
export function clasificarPrioridadInicial(tipo: string): PrioridadIncidente {
  const normalizado = tipo.toLowerCase();
  if (PALABRAS_CRITICAS.some((p) => normalizado.includes(p))) return 'CRITICA';
  if (PALABRAS_ALTAS.some((p) => normalizado.includes(p))) return 'ALTA';
  if (PALABRAS_BAJAS.some((p) => normalizado.includes(p))) return 'BAJA';
  return 'MEDIA';
}

/**
 * CU-020: Gestionar incidentes.
 *
 * Ciclo: el personal registra el incidente con prioridad inicial calculada
 * por el sistema (pasos 1-3); el supervisor lo revisa, puede reclasificar su
 * prioridad (CU-020A) y asigna un responsable (pasos 4-6); el responsable
 * reporta el avance hasta cerrarlo, con nota de resolución incluso sin pasar
 * por «en atención» (CU-020B); todo paso queda en la bitácora (paso 9).
 *
 * Relación con CU-019 (Monitorear el evento): `resumenPorEvento` es lo que
 * `PanelService` muestra en el panel en vivo, en vez de los ceros que
 * mostraba mientras este CU no existía.
 */
@Injectable()
export class IncidentesService {
  constructor(
    @InjectDataSource(CONEXION_OPERACION) private readonly datos: DataSource,
    private readonly eventos: EventosService,
    private readonly notificador: NotificadorIncidentes,
  ) {}

  // --- Pasos 1-3: registrar -----------------------------------------------------

  async registrar(eventoId: string, dto: RegistrarIncidenteDto, reportadoPor: string): Promise<FilaIncidente> {
    const { evento } = await this.eventos.detalle(eventoId);
    const ahora = Date.now();
    const enCurso = evento.estado === 'PUBLICADO' && evento.fechaInicio.getTime() <= ahora && evento.fechaFin.getTime() > ahora;
    if (!enCurso) {
      throw new ConflictException({ codigo: 'EVENTO_NO_EN_CURSO', mensaje: 'Solo se registran incidentes de un evento en curso.' });
    }
    const prioridad = clasificarPrioridadInicial(dto.tipo);

    const id = await this.datos.transaction(async (m) => {
      const [{ id }] = await m.query(
        `INSERT INTO incidentes (evento_id, tipo, ubicacion, descripcion, prioridad, reportado_por)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [eventoId, dto.tipo.trim(), dto.ubicacion.trim(), dto.descripcion.trim(), prioridad, reportadoPor],
      );
      await this.anotar(m, id, 'CREADO', reportadoPor, { tipo: dto.tipo.trim(), ubicacion: dto.ubicacion.trim(), prioridad });
      // Paso 3: notifica al supervisor. Un crítico se entrega antes que el resto.
      await this.avisar(m, id, 'SUPERVISOR', prioridad,
        `Nuevo incidente ${prioridad}: ${dto.tipo.trim()} en ${dto.ubicacion.trim()}.`);
      return id as string;
    });
    void this.notificador.despachar();
    return this.buscar(this.datos.manager, id);
  }

  // --- Consultas ------------------------------------------------------------------

  /** Listado ordenado por atención (CU-020A): prioridad primero, luego antigüedad. */
  async listarDeEvento(eventoId: string, estado?: EstadoIncidente): Promise<FilaIncidente[]> {
    const filas: FilaIncidente[] = estado
      ? await this.datos.query(`SELECT ${COLUMNAS} FROM incidentes WHERE evento_id = $1 AND estado = $2`, [eventoId, estado])
      : await this.datos.query(`SELECT ${COLUMNAS} FROM incidentes WHERE evento_id = $1`, [eventoId]);
    return filas.sort((a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad] || a.creadoEn.getTime() - b.creadoEn.getTime());
  }

  async detalle(id: string) {
    const incidente = await this.buscar(this.datos.manager, id);
    const bitacora = await this.datos.query(
      `SELECT id, tipo, detalle, realizado_por AS "realizadoPor", fecha FROM bitacora_incidentes WHERE incidente_id = $1 ORDER BY fecha DESC LIMIT 100`,
      [id],
    );
    return { incidente, bitacora };
  }

  /** Lo que CU-019 (Monitorear el evento) muestra en su panel en vivo. */
  async resumenPorEvento(eventoId: string) {
    const filas: { prioridad: PrioridadIncidente; estado: EstadoIncidente; n: number }[] = await this.datos.query(
      `SELECT prioridad, estado, count(*)::int AS n FROM incidentes WHERE evento_id = $1 AND estado != 'CERRADO' GROUP BY prioridad, estado`,
      [eventoId],
    );
    const porPrioridad: Record<PrioridadIncidente, number> = { BAJA: 0, MEDIA: 0, ALTA: 0, CRITICA: 0 };
    let abiertos = 0;
    let sinResponsable = 0;
    for (const f of filas) {
      porPrioridad[f.prioridad] += f.n;
      abiertos += f.n;
      if (f.estado === 'ABIERTO') sinResponsable += f.n;
    }
    return { disponible: true, abiertos, sinResponsable, porPrioridad };
  }

  /**
   * CU-032: informe de incidentes de un evento en un rango de fechas, para el
   * dashboard de reportes. A diferencia de `resumenPorEvento` (solo lo
   * abierto, para el panel en vivo de CU-019), aquí cuentan también los ya
   * cerrados: lo que importa para analítica posterior al evento.
   */
  async informe(eventoId: string, desde: Date, hasta: Date) {
    const filas: { prioridad: PrioridadIncidente; estado: EstadoIncidente; n: number }[] = await this.datos.query(
      `SELECT prioridad, estado, count(*)::int AS n FROM incidentes
        WHERE evento_id = $1 AND creado_en >= $2 AND creado_en <= $3
        GROUP BY prioridad, estado`,
      [eventoId, desde, hasta],
    );
    const porPrioridad: Record<PrioridadIncidente, number> = { BAJA: 0, MEDIA: 0, ALTA: 0, CRITICA: 0 };
    const porEstado: Record<EstadoIncidente, number> = { ABIERTO: 0, EN_ATENCION: 0, RESUELTO: 0, CERRADO: 0 };
    let total = 0;
    for (const f of filas) {
      porPrioridad[f.prioridad] += f.n;
      porEstado[f.estado] += f.n;
      total += f.n;
    }
    return { total, cerrados: porEstado.CERRADO, abiertos: total - porEstado.CERRADO, porPrioridad, porEstado };
  }

  // --- Paso 4 / CU-020A: reclasificar prioridad ------------------------------------

  async reclasificar(id: string, dto: ReclasificarPrioridadDto, supervisor: string): Promise<FilaIncidente> {
    await this.datos.transaction(async (m) => {
      const incidente = await this.buscar(m, id, true);
      this.exigirAbierto(incidente);
      if (incidente.prioridad === dto.prioridad) return;
      await m.query(`UPDATE incidentes SET prioridad = $2, actualizado_en = now() WHERE id = $1`, [id, dto.prioridad]);
      await this.anotar(m, id, 'PRIORIDAD_CAMBIADA', supervisor, { antes: incidente.prioridad, despues: dto.prioridad });
    });
    return this.buscar(this.datos.manager, id);
  }

  // --- Paso 5-6: asignar responsable ------------------------------------------------

  async asignarResponsable(id: string, dto: AsignarResponsableDto, supervisor: string): Promise<FilaIncidente> {
    await this.datos.transaction(async (m) => {
      const incidente = await this.buscar(m, id, true);
      this.exigirAbierto(incidente);
      await m.query(
        `UPDATE incidentes SET responsable_id = $2, asignado_por = $3, asignado_en = now(),
                                estado = CASE WHEN estado = 'ABIERTO' THEN 'EN_ATENCION' ELSE estado END, actualizado_en = now()
         WHERE id = $1`,
        [id, dto.responsableId, supervisor],
      );
      await this.anotar(m, id, 'RESPONSABLE_ASIGNADO', supervisor, { responsableId: dto.responsableId });
      // Paso 6: notifica al responsable asignado.
      await this.avisar(m, id, 'RESPONSABLE', incidente.prioridad,
        `Se te asignó el incidente ${incidente.tipo} (${incidente.prioridad}) en ${incidente.ubicacion}.`);
    });
    void this.notificador.despachar();
    return this.buscar(this.datos.manager, id);
  }

  // --- Pasos 7-8: avance -------------------------------------------------------------

  async reportarAvance(id: string, dto: ReportarAvanceDto, quien: string): Promise<FilaIncidente> {
    await this.datos.transaction(async (m) => {
      const incidente = await this.buscar(m, id, true);
      this.exigirAbierto(incidente);
      if (dto.estado === 'EN_ATENCION' && incidente.estado === 'RESUELTO') {
        throw new ConflictException({ codigo: 'AVANCE_INVALIDO', mensaje: 'El incidente ya está resuelto; no vuelve a «en atención».' });
      }
      await m.query(`UPDATE incidentes SET estado = $2, actualizado_en = now() WHERE id = $1`, [id, dto.estado]);
      await this.anotar(m, id, 'AVANCE_REPORTADO', quien, { antes: incidente.estado, despues: dto.estado, nota: dto.nota?.trim() ?? null });
    });
    return this.buscar(this.datos.manager, id);
  }

  // --- CU-020B: cerrar directamente ---------------------------------------------------

  async cerrar(id: string, dto: CerrarIncidenteDto, quien: string): Promise<FilaIncidente> {
    await this.datos.transaction(async (m) => {
      const incidente = await this.buscar(m, id, true);
      this.exigirAbierto(incidente);
      await m.query(
        `UPDATE incidentes SET estado = 'CERRADO', nota_resolucion = $2, cerrado_por = $3, cerrado_en = now(), actualizado_en = now() WHERE id = $1`,
        [id, dto.notaResolucion.trim(), quien],
      );
      await this.anotar(m, id, 'CERRADO', quien, { desde: incidente.estado, notaResolucion: dto.notaResolucion.trim() });
    });
    return this.buscar(this.datos.manager, id);
  }

  // --- Apoyo -------------------------------------------------------------------------

  private exigirAbierto(incidente: FilaIncidente): void {
    if (incidente.estado === 'CERRADO') {
      throw new ConflictException({ codigo: 'INCIDENTE_CERRADO', mensaje: 'Este incidente ya está cerrado.' });
    }
  }

  private async buscar(m: EntityManager, id: string, bloquear = false): Promise<FilaIncidente> {
    const [fila] = await m.query(`SELECT ${COLUMNAS} FROM incidentes WHERE id = $1${bloquear ? ' FOR UPDATE' : ''}`, [id]);
    if (!fila) throw new NotFoundException({ codigo: 'INCIDENTE_NO_ENCONTRADO', mensaje: 'El incidente no existe.' });
    return fila;
  }

  private anotar(m: EntityManager, id: string, tipo: string, usuario: string | null, detalle: Record<string, unknown>) {
    return m.query(`INSERT INTO bitacora_incidentes (incidente_id, tipo, detalle, realizado_por) VALUES ($1, $2, $3, $4)`, [id, tipo, JSON.stringify(detalle), usuario]);
  }

  /** Bandeja de salida: se publica al confirmar la transacción (`NotificadorIncidentes`). */
  private async avisar(m: EntityManager, incidenteId: string, destinatario: 'SUPERVISOR' | 'RESPONSABLE', prioridadIncidente: PrioridadIncidente, mensaje: string) {
    // RNF: un incidente crítico se entrega antes que uno de prioridad baja.
    const prioridadCola = destinatario === 'SUPERVISOR' ? Math.min(10, 4 + (3 - ORDEN_PRIORIDAD[prioridadIncidente]) * 2) : 3;
    await m.query(`INSERT INTO notificaciones_incidentes (incidente_id, destinatario, mensaje, prioridad) VALUES ($1, $2, $3, $4)`,
      [incidenteId, destinatario, mensaje, prioridadCola]);
  }
}
