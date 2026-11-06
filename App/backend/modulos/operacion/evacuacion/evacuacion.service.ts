import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { EventosService } from '../../eventos-recintos/eventos/eventos.service';
import { RecintosService } from '../../eventos-recintos/recintos/recintos.service';
import { CoberturaPersonalService } from '../../personal-logistica/turnos-asistencia/cobertura-personal.service';
import { CONEXION_OPERACION } from '../persistencia/conexion';
import { ActivarEvacuacionDto, GuardarPlanDto, ReporteZonaDto } from './dto/evacuacion.dto';
import { NotificadorEvacuacion } from './notificador-evacuacion.service';

/** Umbrales del seguimiento (paso 10 y CU-010B). Fijos y a la vista, como en el monitoreo. */
export const UMBRALES_EVACUACION = {
  /** Minutos que debería tardar una salida en desalojar lo que se le asignó antes de avisar de saturación. */
  minutosSalida: 10,
  /** Distancia en el plano (% del ancho/alto) por debajo de la cual dos zonas son vecinas (nivel 2). */
  vecindad: 3,
} as const;

export type EstadoEvacuacion = 'PROPUESTA' | 'ACTIVA' | 'FINALIZADA' | 'DESCARTADA';
export type EstadoZona = 'PENDIENTE' | 'EN_CURSO' | 'EVACUADA';
export type Canal = 'PERSONAL' | 'ASISTENTES' | 'ALTAVOCES';

export interface ZonaPlano { id: string; nombre: string; capacidad: number; x: number | null; y: number | null; ancho: number | null; alto: number | null }

export interface Salida { id: string; nombre: string; capacidadPorMinuto: number | null; habilitada: boolean; motivoBloqueo: string | null }

export interface Ruta { id: string; zonaId: string; salidaId: string; salida: string; prioridad: number; descripcion: string | null }

export interface FilaEvacuacion {
  id: string; eventoId: string; recintoId: string; tipo: string; ubicacion: string; nivel: number;
  alcance: 'PARCIAL' | 'TOTAL'; zonaOrigenId: string | null; estado: EstadoEvacuacion; descripcion: string | null;
  creadaPor: string; creadaEn: Date; activadaPor: string | null; activadaEn: Date | null;
  finalizadaPor: string | null; finalizadaEn: Date | null; observaciones: string | null; reporte: Record<string, unknown> | null;
}

export interface FilaZona {
  zonaId: string; nombre: string; capacidad: number; ocupacionEstimada: number; personasRestantes: number;
  estado: EstadoZona; salidaId: string | null; salidaNombre: string | null; instruccion: string | null;
  incorporadaEnNivel: number; actualizadoEn: Date;
}

export interface AlertaEvacuacion {
  tipo: 'SIN_RUTA' | 'ZONA_CONGESTIONADA' | 'SALIDA_SATURADA';
  severidad: 'aviso' | 'critica';
  zonaId?: string;
  salidaId?: string;
  mensaje: string;
  /** Ruta alternativa propuesta por el sistema: el supervisor la confirma (CU-010B). */
  sugerencia?: { zonaId: string; salidaId: string; salida: string; texto: string };
}

const COLUMNAS_EVACUACION = `id, evento_id AS "eventoId", recinto_id AS "recintoId", tipo, ubicacion, nivel, alcance,
  zona_origen_id AS "zonaOrigenId", estado, descripcion, creada_por AS "creadaPor", creada_en AS "creadaEn",
  activada_por AS "activadaPor", activada_en AS "activadaEn", finalizada_por AS "finalizadaPor",
  finalizada_en AS "finalizadaEn", observaciones, reporte`;

const COLUMNAS_ZONA = `zona_id AS "zonaId", nombre, capacidad, ocupacion_estimada AS "ocupacionEstimada",
  personas_restantes AS "personasRestantes", estado, salida_id AS "salidaId", salida_nombre AS "salidaNombre",
  instruccion, incorporada_en_nivel AS "incorporadaEnNivel", actualizado_en AS "actualizadoEn"`;

/** Prioridad en la cola según el nivel: un nivel 3 adelanta a todo lo demás. */
const prioridad = (nivel: number, canal: Canal) => Math.min(10, 4 + nivel * 2 - (canal === 'ALTAVOCES' ? 0 : 1));

/**
 * CU-010: Gestionar evacuación ante emergencias.
 *
 * Ciclo: el supervisor registra la emergencia y el sistema le **propone**
 * zonas afectadas, aforo y rutas (pasos 1-6); al confirmarla queda **activa**
 * y se avisa a personal y asistentes (7-9); el personal reporta el avance de
 * cada zona y el sistema alerta de rutas sin salida, zonas con gente de más o
 * salidas saturadas (10-11, CU-010A/B); el nivel se puede escalar (CU-010D) y
 * la evacuación puede ser solo de una zona (CU-010C). Al finalizar queda el
 * reporte de auditoría (12-13).
 *
 * Fuentes por interfaz local: evento y recinto con sus zonas (CU-026/029),
 * personal presente (CU-018) y la copia de ingresos del monitoreo (CU-019)
 * para el aforo. El plan de evacuación (salidas y rutas) vive en `operacion`.
 *
 * Limitación: el aforo por zona se **estima** repartiendo los asistentes
 * ingresados según la capacidad de cada zona, porque Acceso QR registra la
 * puerta y no la zona. El personal lo corrige con sus reportes.
 */
@Injectable()
export class EvacuacionService {
  constructor(
    @InjectDataSource(CONEXION_OPERACION) private readonly datos: DataSource,
    private readonly eventos: EventosService,
    private readonly recintos: RecintosService,
    private readonly cobertura: CoberturaPersonalService,
    private readonly notificador: NotificadorEvacuacion,
  ) {}

  // --- Plan de evacuación del recinto (precondición 1) ------------------------

  async plan(recintoId: string) {
    const { recinto } = await this.recintos.detalle(recintoId);
    const [salidas, rutas] = await Promise.all([this.salidasDe(this.datos.manager, recintoId), this.rutasDe(this.datos.manager, recintoId)]);
    const zonas = recinto.zonas.map((z) => ({ id: z.id, nombre: z.nombre, capacidad: z.capacidad, rutas: rutas.filter((r) => r.zonaId === z.id) }));
    const zonasSinRuta = zonas.filter((z) => z.rutas.length === 0).map((z) => z.nombre);
    return {
      recinto: { id: recinto.id, nombre: recinto.nombre, ciudad: recinto.ciudad },
      salidas,
      zonas,
      completo: salidas.length > 0 && zonas.length > 0 && zonasSinRuta.length === 0,
      zonasSinRuta,
    };
  }

  /**
   * Reemplaza el plan del recinto. Las salidas se conservan por nombre (y con
   * ellas su estado de bloqueo); las que desaparecen se borran con sus rutas.
   * No se cambia un plan mientras haya una evacuación activa en ese recinto.
   */
  async guardarPlan(recintoId: string, dto: GuardarPlanDto, usuario: string) {
    const { recinto } = await this.recintos.detalle(recintoId);
    const zonas = new Set(recinto.zonas.map((z) => z.id));
    const nombres = new Map<string, string>();
    for (const s of dto.salidas) {
      const clave = s.nombre.trim().toLowerCase();
      if (nombres.has(clave)) throw new BadRequestException({ codigo: 'SALIDA_REPETIDA', mensaje: `La salida «${s.nombre.trim()}» está repetida.` });
      nombres.set(clave, s.nombre.trim());
    }
    const pares = new Set<string>();
    for (const r of dto.rutas) {
      if (!zonas.has(r.zonaId)) throw new BadRequestException({ codigo: 'ZONA_AJENA', mensaje: 'Una ruta apunta a una zona que no es de este recinto.' });
      const clave = r.salida.trim().toLowerCase();
      if (!nombres.has(clave)) throw new BadRequestException({ codigo: 'SALIDA_DESCONOCIDA', mensaje: `La ruta usa la salida «${r.salida.trim()}», que no está en el plan.` });
      if (pares.has(`${r.zonaId}:${clave}`)) throw new BadRequestException({ codigo: 'RUTA_REPETIDA', mensaje: 'Hay dos rutas de la misma zona a la misma salida.' });
      pares.add(`${r.zonaId}:${clave}`);
    }

    await this.datos.transaction(async (m) => {
      const [{ activas }] = await m.query(`SELECT count(*)::int AS activas FROM evacuaciones WHERE recinto_id = $1 AND estado = 'ACTIVA'`, [recintoId]);
      if (activas > 0) throw new ConflictException({ codigo: 'EVACUACION_EN_CURSO', mensaje: 'No se cambia el plan durante una evacuación activa.' });

      const existentes: { id: string; nombre: string }[] = await m.query(`SELECT id, nombre FROM salidas_emergencia WHERE recinto_id = $1`, [recintoId]);
      const ids = new Map<string, string>();
      for (const s of dto.salidas) {
        const previa = existentes.find((e) => e.nombre.toLowerCase() === s.nombre.trim().toLowerCase());
        if (previa) {
          await m.query(`UPDATE salidas_emergencia SET nombre = $2, capacidad_por_minuto = $3, actualizado_por = $4, actualizado_en = now() WHERE id = $1`,
            [previa.id, s.nombre.trim(), s.capacidadPorMinuto ?? null, usuario]);
          ids.set(s.nombre.trim().toLowerCase(), previa.id);
        } else {
          const [{ id }] = await m.query(
            `INSERT INTO salidas_emergencia (recinto_id, nombre, capacidad_por_minuto, actualizado_por) VALUES ($1, $2, $3, $4) RETURNING id`,
            [recintoId, s.nombre.trim(), s.capacidadPorMinuto ?? null, usuario]);
          ids.set(s.nombre.trim().toLowerCase(), id);
        }
      }
      const conservadas = [...ids.values()];
      await m.query(`DELETE FROM salidas_emergencia WHERE recinto_id = $1 AND NOT (id = ANY($2::uuid[]))`, [recintoId, conservadas]);
      await m.query(`DELETE FROM rutas_evacuacion WHERE recinto_id = $1`, [recintoId]);
      for (const r of dto.rutas) {
        await m.query(`INSERT INTO rutas_evacuacion (recinto_id, zona_id, salida_id, prioridad, descripcion) VALUES ($1, $2, $3, $4, $5)`,
          [recintoId, r.zonaId, ids.get(r.salida.trim().toLowerCase()), r.prioridad, r.descripcion?.trim() || null]);
      }
    });
    return this.plan(recintoId);
  }

  // --- Consultas ------------------------------------------------------------------

  /** Eventos publicados que no terminaron hace más de un día, con su evacuación abierta si la hay. */
  async eventosOperables() {
    const ahora = Date.now();
    const publicados = (await this.eventos.listar('PUBLICADO')).filter((e) => e.fechaFin.getTime() > ahora - 24 * 3_600_000);
    const abiertas: { eventoId: string; id: string; estado: EstadoEvacuacion; nivel: number }[] = publicados.length
      ? await this.datos.query(`SELECT evento_id AS "eventoId", id, estado, nivel FROM evacuaciones WHERE estado IN ('PROPUESTA', 'ACTIVA') AND evento_id = ANY($1::uuid[])`,
        [publicados.map((e) => e.id)])
      : [];
    return publicados
      .map((e) => ({
        id: e.id, nombre: e.nombre, recinto: e.recinto?.nombre ?? null, recintoId: e.recintoId, ciudad: e.recinto?.ciudad ?? null,
        fechaInicio: e.fechaInicio, fechaFin: e.fechaFin,
        enCurso: e.fechaInicio.getTime() <= ahora && e.fechaFin.getTime() > ahora,
        evacuacion: abiertas.find((a) => a.eventoId === e.id) ?? null,
      }))
      .sort((a, b) => Number(b.enCurso) - Number(a.enCurso) || a.fechaInicio.getTime() - b.fechaInicio.getTime());
  }

  historialDeEvento(eventoId: string) {
    return this.datos.query(`SELECT ${COLUMNAS_EVACUACION} FROM evacuaciones WHERE evento_id = $1 ORDER BY creada_en DESC LIMIT 50`, [eventoId]);
  }

  /** Lo que ve el personal en la app: solo una evacuación ya activa, con sus rutas. */
  async activaDeEvento(eventoId: string) {
    const [fila] = await this.datos.query(`SELECT id FROM evacuaciones WHERE evento_id = $1 AND estado = 'ACTIVA'`, [eventoId]);
    return { activa: fila ? await this.detalle(fila.id) : null };
  }

  /** Pasos 10-11: el estado de la evacuación y sus alertas, calculadas al leer. */
  async detalle(id: string) {
    const evacuacion = await this.buscar(this.datos.manager, id);
    const [zonas, salidas, rutas, avisos, bitacora, personal] = await Promise.all([
      this.zonasDe(this.datos.manager, id),
      this.salidasDe(this.datos.manager, evacuacion.recintoId),
      this.rutasDe(this.datos.manager, evacuacion.recintoId),
      this.datos.query(
        `SELECT id, canal, zona_id AS "zonaId", mensaje, prioridad, creada_en AS "creadaEn", publicada_en AS "publicadaEn",
                entregada_en AS "entregadaEn", intentos
           FROM notificaciones_evacuacion WHERE evacuacion_id = $1 ORDER BY creada_en DESC LIMIT 200`, [id]),
      this.datos.query(`SELECT id, tipo, detalle, realizado_por AS "realizadoPor", fecha FROM bitacora_evacuacion WHERE evacuacion_id = $1 ORDER BY fecha DESC LIMIT 200`, [id]),
      this.cobertura.deEvento(evacuacion.eventoId).catch(() => []),
    ]);
    const abierta = evacuacion.estado === 'PROPUESTA' || evacuacion.estado === 'ACTIVA';
    return {
      evacuacion,
      zonas: zonas.map((z) => ({ ...z, rutas: rutas.filter((r) => r.zonaId === z.zonaId).map((r) => ({ ...r, habilitada: salidas.find((s) => s.id === r.salidaId)?.habilitada ?? false })) })),
      salidas,
      alertas: abierta ? this.evaluar(zonas, salidas, rutas) : [],
      resumen: {
        zonas: zonas.length,
        evacuadas: zonas.filter((z) => z.estado === 'EVACUADA').length,
        personasRestantes: zonas.reduce((n, z) => n + z.personasRestantes, 0),
        ocupacionEstimadaInicial: zonas.reduce((n, z) => n + z.ocupacionEstimada, 0),
      },
      personal: {
        asignados: personal.reduce((n, z) => n + z.asignados, 0),
        presentes: personal.reduce((n, z) => n + z.presentes, 0),
        zonas: personal,
      },
      avisos: {
        total: avisos.length,
        pendientes: avisos.filter((a: { publicadaEn: Date | null }) => !a.publicadaEn).length,
        entregados: avisos.filter((a: { entregadaEn: Date | null }) => a.entregadaEn).length,
        lista: avisos,
      },
      bitacora,
      umbrales: UMBRALES_EVACUACION,
      actualizadoEn: new Date(),
    };
  }

  // --- Pasos 1-6: proponer ------------------------------------------------------

  async proponer(eventoId: string, dto: ActivarEvacuacionDto, usuario: string) {
    const { evento, recinto } = await this.eventos.detalle(eventoId);
    if (evento.estado !== 'PUBLICADO') throw new ConflictException({ codigo: 'EVENTO_NO_PUBLICADO', mensaje: 'Solo se evacúa un evento publicado.' });
    if (!recinto) throw new ConflictException({ codigo: 'PLAN_EVACUACION_INCOMPLETO', mensaje: 'El evento no tiene recinto.' });

    const zonasRecinto: ZonaPlano[] = recinto.zonas;
    const ids = new Set(zonasRecinto.map((z) => z.id));
    for (const zonaId of [dto.zonaOrigenId, ...(dto.zonasIds ?? [])].filter((z): z is string => !!z)) {
      if (!ids.has(zonaId)) throw new BadRequestException({ codigo: 'ZONA_AJENA', mensaje: 'La zona indicada no es de este recinto.' });
    }

    const id = await this.datos.transaction(async (m) => {
      const [salidas, rutas] = await Promise.all([this.salidasDe(m, recinto.id), this.rutasDe(m, recinto.id)]);
      // Precondición 1: zonas, salidas y rutas configuradas.
      if (!zonasRecinto.length || !salidas.length || !rutas.length) {
        throw new ConflictException({
          codigo: 'PLAN_EVACUACION_INCOMPLETO',
          mensaje: 'El recinto necesita zonas, salidas de emergencia y rutas de evacuación configuradas antes de activar una evacuación.',
        });
      }

      // Paso 2: zonas afectadas según alcance y nivel.
      const afectadas = this.zonasAfectadas(zonasRecinto, dto.nivel, dto.alcance, [dto.zonaOrigenId, ...(dto.zonasIds ?? [])].filter((z): z is string => !!z));
      // Paso 3: aforo actual, repartido por capacidad (ver la limitación arriba).
      const [{ asistentes }] = await m.query(`SELECT count(*)::int AS asistentes FROM ingresos WHERE evento_id = $1`, [eventoId]);
      const capacidadTotal = zonasRecinto.reduce((n, z) => n + z.capacidad, 0) || 1;

      let id: string;
      try {
        [{ id }] = await m.query(
          `INSERT INTO evacuaciones (evento_id, recinto_id, tipo, ubicacion, nivel, alcance, zona_origen_id, descripcion, creada_por)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [eventoId, recinto.id, dto.tipo, dto.ubicacion.trim(), dto.nivel, dto.nivel === 3 ? 'TOTAL' : dto.alcance,
            dto.zonaOrigenId ?? null, dto.descripcion?.trim() || null, usuario]);
      } catch (error) {
        if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
          throw new ConflictException({ codigo: 'EVACUACION_ABIERTA', mensaje: 'Ya hay una evacuación propuesta o activa en este evento.' });
        }
        throw error;
      }

      // Pasos 4-5: salidas disponibles y la ruta de cada zona.
      for (const zona of afectadas) {
        const ocupacion = Math.round((asistentes * zona.capacidad) / capacidadTotal);
        const ruta = this.mejorRuta(zona.id, rutas, salidas);
        await m.query(
          `INSERT INTO evacuacion_zonas (evacuacion_id, zona_id, nombre, capacidad, ocupacion_estimada, personas_restantes, salida_id, salida_nombre, instruccion, incorporada_en_nivel, actualizado_por)
           VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10)`,
          [id, zona.id, zona.nombre, zona.capacidad, ocupacion, ruta?.salidaId ?? null, ruta?.salida ?? null, instruccion(zona.nombre, ruta), dto.nivel, usuario]);
      }
      await this.anotar(m, id, 'PROPUESTA', usuario, {
        tipo: dto.tipo, nivel: dto.nivel, alcance: dto.alcance, ubicacion: dto.ubicacion.trim(),
        zonas: afectadas.map((z) => z.nombre), asistentes,
      });
      return id;
    });
    // Paso 6: lo que se presenta al supervisor.
    return this.detalle(id);
  }

  // --- Pasos 7-9: confirmar y avisar ---------------------------------------------

  async confirmar(id: string, usuario: string) {
    await this.datos.transaction(async (m) => {
      const ev = await this.buscar(m, id, true);
      if (ev.estado !== 'PROPUESTA') throw new ConflictException({ codigo: 'EVACUACION_NO_PROPUESTA', mensaje: `La evacuación ya está ${ev.estado.toLowerCase()}.` });
      await m.query(`UPDATE evacuaciones SET estado = 'ACTIVA', activada_por = $2, activada_en = now() WHERE id = $1`, [id, usuario]);
      await m.query(`UPDATE evacuacion_zonas SET estado = 'EN_CURSO', actualizado_en = now() WHERE evacuacion_id = $1 AND estado = 'PENDIENTE'`, [id]);
      const zonas = await this.zonasDe(m, id);
      await this.anotar(m, id, 'ACTIVADA', usuario, { nivel: ev.nivel, zonas: zonas.length });
      await this.avisar(m, ev, 'PERSONAL', null,
        `EVACUACIÓN por ${ev.tipo.replace(/_/g, ' ').toLowerCase()}, nivel ${ev.nivel} en ${ev.ubicacion}. Zonas: ${zonas.map((z) => z.nombre).join(', ')}. Diríjanse a sus puestos de evacuación.`);
      for (const z of zonas) await this.avisar(m, ev, 'ASISTENTES', z.zonaId, z.instruccion ?? instruccion(z.nombre, null));
      if (ev.nivel === 3) await this.avisar(m, ev, 'ALTAVOCES', null, `Atención: evacuación general del recinto. Siga las indicaciones del personal y la señalización.`);
    });
    void this.notificador.despachar();
    return this.detalle(id);
  }

  async descartar(id: string, usuario: string) {
    await this.datos.transaction(async (m) => {
      const ev = await this.buscar(m, id, true);
      if (ev.estado !== 'PROPUESTA') throw new ConflictException({ codigo: 'EVACUACION_NO_PROPUESTA', mensaje: 'Solo se descarta una evacuación que no se ha activado.' });
      await m.query(`UPDATE evacuaciones SET estado = 'DESCARTADA', finalizada_por = $2, finalizada_en = now() WHERE id = $1`, [id, usuario]);
      await this.anotar(m, id, 'DESCARTADA', usuario, {});
    });
    return this.detalle(id);
  }

  // --- Paso 10: avance por zona ----------------------------------------------------

  async reportarZona(id: string, zonaId: string, dto: ReporteZonaDto, usuario: string) {
    if (dto.personasRestantes === undefined && !dto.estado) throw new BadRequestException('Indica las personas que quedan o el estado de la zona.');
    await this.datos.transaction(async (m) => {
      const ev = await this.buscar(m, id, true);
      this.exigirActiva(ev);
      const zona = (await this.zonasDe(m, id)).find((z) => z.zonaId === zonaId);
      if (!zona) throw new NotFoundException({ codigo: 'ZONA_NO_AFECTADA', mensaje: 'Esa zona no está en esta evacuación.' });
      const estado: EstadoZona = dto.estado ?? (dto.personasRestantes === 0 ? 'EVACUADA' : zona.estado === 'EVACUADA' ? 'EN_CURSO' : zona.estado);
      const personas = estado === 'EVACUADA' ? 0 : dto.personasRestantes ?? zona.personasRestantes;
      await m.query(`UPDATE evacuacion_zonas SET personas_restantes = $3, estado = $4, actualizado_por = $5, actualizado_en = now() WHERE evacuacion_id = $1 AND zona_id = $2`,
        [id, zonaId, personas, estado, usuario]);
      await this.anotar(m, id, 'ZONA_ACTUALIZADA', usuario, { zonaId, zona: zona.nombre, antes: { estado: zona.estado, personas: zona.personasRestantes }, despues: { estado, personas } });
    });
    return this.detalle(id);
  }

  /** CU-010B: el supervisor confirma la ruta alternativa de una zona. */
  async cambiarRuta(id: string, zonaId: string, salidaId: string, motivo: string | undefined, usuario: string) {
    await this.datos.transaction(async (m) => {
      const ev = await this.buscar(m, id, true);
      this.exigirActiva(ev);
      const zona = (await this.zonasDe(m, id)).find((z) => z.zonaId === zonaId);
      if (!zona) throw new NotFoundException({ codigo: 'ZONA_NO_AFECTADA', mensaje: 'Esa zona no está en esta evacuación.' });
      const [salidas, rutas] = await Promise.all([this.salidasDe(m, ev.recintoId), this.rutasDe(m, ev.recintoId)]);
      const ruta = rutas.find((r) => r.zonaId === zonaId && r.salidaId === salidaId);
      if (!ruta) throw new BadRequestException({ codigo: 'RUTA_NO_CONFIGURADA', mensaje: 'Esa salida no es una ruta configurada para la zona.' });
      if (!salidas.find((s) => s.id === salidaId)?.habilitada) throw new ConflictException({ codigo: 'SALIDA_BLOQUEADA', mensaje: 'Esa salida está bloqueada.' });
      await this.asignarRuta(m, ev, zona, ruta, 'RUTA_CAMBIADA', usuario, motivo);
    });
    void this.notificador.despachar();
    return this.detalle(id);
  }

  /**
   * CU-010A: una salida deja de estar disponible. Se descarta en todas las
   * zonas que la usaban y se busca la siguiente ruta configurada; si una zona
   * se queda sin ninguna, queda la alerta crítica SIN_RUTA. Rehabilitarla
   * devuelve la ruta a las zonas que se habían quedado sin salida.
   */
  async bloqueoSalida(id: string, salidaId: string, bloqueada: boolean, motivo: string | undefined, usuario: string) {
    await this.datos.transaction(async (m) => {
      const ev = await this.buscar(m, id, true);
      if (ev.estado !== 'ACTIVA' && ev.estado !== 'PROPUESTA') this.exigirActiva(ev);
      const salidasAntes = await this.salidasDe(m, ev.recintoId);
      const salida = salidasAntes.find((s) => s.id === salidaId);
      if (!salida) throw new NotFoundException({ codigo: 'SALIDA_NO_ENCONTRADA', mensaje: 'La salida no es de este recinto.' });
      await m.query(`UPDATE salidas_emergencia SET habilitada = $2, motivo_bloqueo = $3, actualizado_por = $4, actualizado_en = now() WHERE id = $1`,
        [salidaId, !bloqueada, bloqueada ? motivo!.trim() : null, usuario]);
      await this.anotar(m, id, bloqueada ? 'SALIDA_BLOQUEADA' : 'SALIDA_HABILITADA', usuario, { salidaId, salida: salida.nombre, motivo: motivo?.trim() ?? null });

      const [salidas, rutas, zonas] = await Promise.all([this.salidasDe(m, ev.recintoId), this.rutasDe(m, ev.recintoId), this.zonasDe(m, id)]);
      const afectadas = zonas.filter((z) => z.estado !== 'EVACUADA' && (bloqueada ? z.salidaId === salidaId : z.salidaId === null));
      for (const zona of afectadas) {
        await this.asignarRuta(m, ev, zona, this.mejorRuta(zona.zonaId, rutas, salidas), 'RUTA_RECALCULADA', usuario, bloqueada ? `Salida «${salida.nombre}» bloqueada` : `Salida «${salida.nombre}» habilitada`);
      }
    });
    void this.notificador.despachar();
    return this.detalle(id);
  }

  /**
   * CU-010D: escalar el nivel. Se recalculan las zonas afectadas (las que ya
   * estaban siguen), se les asigna ruta, se amplían los avisos —altavoces en
   * nivel 3— y se pide personal adicional.
   */
  async escalar(id: string, nivel: number, motivo: string, zonasIds: string[] | undefined, usuario: string) {
    const ev0 = await this.buscar(this.datos.manager, id);
    const { recinto } = await this.recintos.detalle(ev0.recintoId);
    const zonasRecinto: ZonaPlano[] = recinto.zonas;
    const ids = new Set(zonasRecinto.map((z) => z.id));
    if ((zonasIds ?? []).some((z) => !ids.has(z))) throw new BadRequestException({ codigo: 'ZONA_AJENA', mensaje: 'La zona indicada no es de este recinto.' });

    await this.datos.transaction(async (m) => {
      const ev = await this.buscar(m, id, true);
      if (ev.estado !== 'ACTIVA' && ev.estado !== 'PROPUESTA') this.exigirActiva(ev);
      if (nivel <= ev.nivel) throw new ConflictException({ codigo: 'NIVEL_NO_SUPERIOR', mensaje: `La emergencia ya está en nivel ${ev.nivel}.` });

      const actuales = await this.zonasDe(m, id);
      const origen = [ev.zonaOrigenId, ...actuales.map((z) => z.zonaId), ...(zonasIds ?? [])].filter((z): z is string => !!z);
      const alcance = nivel === 3 ? 'TOTAL' : ev.alcance;
      const nuevas = this.zonasAfectadas(zonasRecinto, nivel, alcance, origen).filter((z) => !actuales.some((a) => a.zonaId === z.id));
      const [salidas, rutas] = await Promise.all([this.salidasDe(m, ev.recintoId), this.rutasDe(m, ev.recintoId)]);
      const [{ asistentes }] = await m.query(`SELECT count(*)::int AS asistentes FROM ingresos WHERE evento_id = $1`, [ev.eventoId]);
      const capacidadTotal = zonasRecinto.reduce((n, z) => n + z.capacidad, 0) || 1;
      for (const zona of nuevas) {
        const ruta = this.mejorRuta(zona.id, rutas, salidas);
        const ocupacion = Math.round((asistentes * zona.capacidad) / capacidadTotal);
        await m.query(
          `INSERT INTO evacuacion_zonas (evacuacion_id, zona_id, nombre, capacidad, ocupacion_estimada, personas_restantes, estado, salida_id, salida_nombre, instruccion, incorporada_en_nivel, actualizado_por)
           VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11)`,
          [id, zona.id, zona.nombre, zona.capacidad, ocupacion, ev.estado === 'ACTIVA' ? 'EN_CURSO' : 'PENDIENTE', ruta?.salidaId ?? null, ruta?.salida ?? null, instruccion(zona.nombre, ruta), nivel, usuario]);
      }
      await m.query(`UPDATE evacuaciones SET nivel = $2, alcance = $3 WHERE id = $1`, [id, nivel, alcance]);
      await this.anotar(m, id, 'NIVEL_CAMBIADO', usuario, { antes: ev.nivel, despues: nivel, motivo: motivo.trim(), zonasNuevas: nuevas.map((z) => z.nombre) });

      if (ev.estado === 'ACTIVA') {
        const escalada = { ...ev, nivel };
        await this.avisar(m, escalada, 'PERSONAL', null,
          `La emergencia sube a nivel ${nivel}: ${motivo.trim()}. Se requiere personal adicional${nuevas.length ? ` en ${nuevas.map((z) => z.nombre).join(', ')}` : ''}.`);
        for (const zona of nuevas) {
          await this.avisar(m, escalada, 'ASISTENTES', zona.id, instruccion(zona.nombre, this.mejorRuta(zona.id, rutas, salidas)));
        }
        if (nivel === 3) await this.avisar(m, escalada, 'ALTAVOCES', null, 'Atención: evacuación general del recinto. Siga las indicaciones del personal y la señalización.');
      }
    });
    void this.notificador.despachar();
    return this.detalle(id);
  }

  // --- Pasos 12-13: finalizar y reporte ------------------------------------------

  async finalizar(id: string, observaciones: string | undefined, usuario: string) {
    await this.datos.transaction(async (m) => {
      const ev = await this.buscar(m, id, true);
      this.exigirActiva(ev);
      const zonas = await this.zonasDe(m, id);
      const pendientes = zonas.filter((z) => z.estado !== 'EVACUADA');
      if (pendientes.length) {
        throw new ConflictException({
          codigo: 'ZONAS_PENDIENTES',
          mensaje: `Faltan zonas por evacuar: ${pendientes.map((z) => z.nombre).join(', ')}.`,
          zonas: pendientes.map((z) => z.zonaId),
        });
      }
      await this.avisar(m, ev, 'PERSONAL', null, `Evacuación finalizada: todas las zonas fueron evacuadas. Esperen instrucciones del supervisor.`);
      await this.anotar(m, id, 'FINALIZADA', usuario, { observaciones: observaciones?.trim() ?? null });
      await m.query(`UPDATE evacuaciones SET estado = 'FINALIZADA', finalizada_por = $2, finalizada_en = now(), observaciones = $3 WHERE id = $1`,
        [id, usuario, observaciones?.trim() || null]);
      const reporte = await this.armarReporte(m, id);
      await m.query(`UPDATE evacuaciones SET reporte = $2 WHERE id = $1`, [id, JSON.stringify(reporte)]);
    });
    void this.notificador.despachar();
    return this.detalle(id);
  }

  /** Post-condición 3: el reporte de auditoría. Mientras no termina, una vista previa. */
  async reporte(id: string) {
    const ev = await this.buscar(this.datos.manager, id);
    if (ev.reporte) return { final: true, ...ev.reporte };
    return { final: false, ...(await this.armarReporte(this.datos.manager, id)) };
  }

  // --- Cálculos --------------------------------------------------------------------

  /**
   * Paso 2. Total o nivel 3: todo el recinto. Nivel 1: las zonas indicadas.
   * Nivel 2: además, las vecinas en el plano (CU-029); sin geometría no se
   * puede saber cuáles son, y se quedan las indicadas.
   */
  private zonasAfectadas(zonas: ZonaPlano[], nivel: number, alcance: 'PARCIAL' | 'TOTAL', origen: string[]): ZonaPlano[] {
    if (alcance === 'TOTAL' || nivel === 3) return [...zonas];
    const elegidas = zonas.filter((z) => origen.includes(z.id));
    if (nivel === 1) return elegidas;
    const conGeometria = (z: ZonaPlano) => z.x !== null && z.y !== null && z.ancho !== null && z.alto !== null;
    const d = UMBRALES_EVACUACION.vecindad;
    const vecinas = zonas.filter((z) => !origen.includes(z.id) && conGeometria(z) && elegidas.some((o) => conGeometria(o)
      && z.x! - d <= o.x! + o.ancho! && o.x! - d <= z.x! + z.ancho! && z.y! - d <= o.y! + o.alto! && o.y! - d <= z.y! + z.alto!));
    return [...elegidas, ...vecinas];
  }

  /** Pasos 4-5: la ruta de mayor prioridad cuya salida sigue habilitada. */
  private mejorRuta(zonaId: string, rutas: Ruta[], salidas: Salida[], excluir: string[] = []): Ruta | null {
    return rutas
      .filter((r) => r.zonaId === zonaId && !excluir.includes(r.salidaId) && salidas.find((s) => s.id === r.salidaId)?.habilitada)
      .sort((a, b) => a.prioridad - b.prioridad)[0] ?? null;
  }

  /** Paso 10-11 y CU-010A/B: alertas sobre el estado actual. */
  private evaluar(zonas: FilaZona[], salidas: Salida[], rutas: Ruta[]): AlertaEvacuacion[] {
    const alertas: AlertaEvacuacion[] = [];
    const pendientes = zonas.filter((z) => z.estado !== 'EVACUADA');
    for (const z of pendientes) {
      if (!z.salidaId) {
        alertas.push({ tipo: 'SIN_RUTA', severidad: 'critica', zonaId: z.zonaId,
          mensaje: `«${z.nombre}» no tiene ninguna salida habilitada: hay que abrir una o guiar a la gente a mano.` });
        continue;
      }
      if (z.personasRestantes > z.capacidad) {
        const alternativa = this.mejorRuta(z.zonaId, rutas, salidas, [z.salidaId]);
        alertas.push({
          tipo: 'ZONA_CONGESTIONADA', severidad: 'aviso', zonaId: z.zonaId,
          mensaje: `«${z.nombre}» tiene ${z.personasRestantes} personas para una capacidad de ${z.capacidad}.`,
          ...(alternativa ? { sugerencia: { zonaId: z.zonaId, salidaId: alternativa.salidaId, salida: alternativa.salida,
            texto: `Abre la ruta alternativa por «${alternativa.salida}» para «${z.nombre}».` } } : {}),
        });
      }
    }
    for (const s of salidas.filter((x) => x.habilitada && x.capacidadPorMinuto)) {
      const servidas = pendientes.filter((z) => z.salidaId === s.id);
      const personas = servidas.reduce((n, z) => n + z.personasRestantes, 0);
      const minutos = personas / s.capacidadPorMinuto!;
      if (minutos > UMBRALES_EVACUACION.minutosSalida) {
        // Se propone mover la zona con más gente que tenga otra ruta habilitada.
        const candidata = [...servidas].sort((a, b) => b.personasRestantes - a.personasRestantes)
          .map((z) => ({ z, ruta: this.mejorRuta(z.zonaId, rutas, salidas, [s.id]) })).find((x) => x.ruta);
        alertas.push({
          tipo: 'SALIDA_SATURADA', severidad: 'aviso', salidaId: s.id,
          mensaje: `«${s.nombre}» tardaría ${Math.ceil(minutos)} min en desalojar a ${personas} personas.`,
          ...(candidata ? { sugerencia: { zonaId: candidata.z.zonaId, salidaId: candidata.ruta!.salidaId, salida: candidata.ruta!.salida,
            texto: `Desvía «${candidata.z.nombre}» por «${candidata.ruta!.salida}».` } } : {}),
        });
      }
    }
    const orden = { critica: 0, aviso: 1 } as const;
    return alertas.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
  }

  private async armarReporte(m: EntityManager, id: string) {
    const ev = await this.buscar(m, id);
    const [zonas, bitacora, porCanal] = await Promise.all([
      this.zonasDe(m, id),
      m.query(`SELECT tipo, detalle, realizado_por AS "realizadoPor", fecha FROM bitacora_evacuacion WHERE evacuacion_id = $1 ORDER BY fecha`, [id]),
      m.query(
        `SELECT canal, count(*)::int AS total,
                count(*) FILTER (WHERE entregada_en IS NOT NULL)::int AS entregados,
                count(*) FILTER (WHERE publicada_en IS NULL)::int AS pendientes,
                max(extract(epoch FROM (entregada_en - creada_en)) * 1000)::float AS "latenciaMaximaMs"
           FROM notificaciones_evacuacion WHERE evacuacion_id = $1 GROUP BY canal ORDER BY canal`, [id]),
    ]) as [FilaZona[], unknown[], { canal: Canal; total: number; entregados: number; pendientes: number; latenciaMaximaMs: number | null }[]];
    const avisos = {
      total: porCanal.reduce((n, c) => n + c.total, 0),
      entregados: porCanal.reduce((n, c) => n + c.entregados, 0),
      pendientes: porCanal.reduce((n, c) => n + c.pendientes, 0),
      latenciaMaximaMs: porCanal.reduce<number | null>((max, c) => (c.latenciaMaximaMs === null ? max : Math.max(max ?? 0, c.latenciaMaximaMs)), null),
      porCanal,
    };
    const inicio = ev.activadaEn ?? ev.creadaEn;
    const fin = ev.finalizadaEn ?? new Date();
    return {
      evacuacionId: ev.id,
      eventoId: ev.eventoId,
      tipo: ev.tipo,
      ubicacion: ev.ubicacion,
      nivelFinal: ev.nivel,
      alcance: ev.alcance,
      creadaPor: ev.creadaPor,
      activadaPor: ev.activadaPor,
      activadaEn: ev.activadaEn,
      finalizadaPor: ev.finalizadaPor,
      finalizadaEn: ev.finalizadaEn,
      duracionMinutos: Math.round(((fin.getTime() - new Date(inicio).getTime()) / 60_000) * 10) / 10,
      observaciones: ev.observaciones,
      zonas: zonas.map((z) => ({ zonaId: z.zonaId, nombre: z.nombre, estadoFinal: z.estado, ocupacionEstimada: z.ocupacionEstimada, salida: z.salidaNombre, incorporadaEnNivel: z.incorporadaEnNivel })),
      avisos,
      bitacora,
    };
  }

  // --- Apoyo -------------------------------------------------------------------------

  private async asignarRuta(m: EntityManager, ev: FilaEvacuacion, zona: FilaZona, ruta: Ruta | null, tipo: string, usuario: string, motivo?: string) {
    const texto = instruccion(zona.nombre, ruta);
    await m.query(`UPDATE evacuacion_zonas SET salida_id = $3, salida_nombre = $4, instruccion = $5, actualizado_por = $6, actualizado_en = now() WHERE evacuacion_id = $1 AND zona_id = $2`,
      [ev.id, zona.zonaId, ruta?.salidaId ?? null, ruta?.salida ?? null, texto, usuario]);
    await this.anotar(m, ev.id, tipo, usuario, { zonaId: zona.zonaId, zona: zona.nombre, antes: zona.salidaNombre, despues: ruta?.salida ?? null, motivo: motivo?.trim() ?? null });
    if (ev.estado === 'ACTIVA') {
      await this.avisar(m, ev, 'ASISTENTES', zona.zonaId, `Cambio de ruta. ${texto}`);
      await this.avisar(m, ev, 'PERSONAL', zona.zonaId,
        ruta ? `«${zona.nombre}» ahora evacúa por «${ruta.salida}»${motivo ? ` (${motivo.trim()})` : ''}.` : `«${zona.nombre}» se quedó sin salida habilitada: guíen a la gente a mano.`);
    }
  }

  /** Bandeja de salida: se publica al confirmar la transacción (`NotificadorEvacuacion`). */
  private async avisar(m: EntityManager, ev: Pick<FilaEvacuacion, 'id' | 'nivel'>, canal: Canal, zonaId: string | null, mensaje: string) {
    await m.query(`INSERT INTO notificaciones_evacuacion (evacuacion_id, canal, zona_id, mensaje, prioridad) VALUES ($1, $2, $3, $4, $5)`,
      [ev.id, canal, zonaId, mensaje, prioridad(ev.nivel, canal)]);
  }

  private anotar(m: EntityManager, id: string, tipo: string, usuario: string | null, detalle: Record<string, unknown>) {
    return m.query(`INSERT INTO bitacora_evacuacion (evacuacion_id, tipo, detalle, realizado_por) VALUES ($1, $2, $3, $4)`, [id, tipo, JSON.stringify(detalle), usuario]);
  }

  private exigirActiva(ev: FilaEvacuacion) {
    if (ev.estado !== 'ACTIVA') throw new ConflictException({ codigo: 'EVACUACION_NO_ACTIVA', mensaje: `La evacuación está ${ev.estado.toLowerCase()}.` });
  }

  private async buscar(m: EntityManager, id: string, bloquear = false): Promise<FilaEvacuacion> {
    const [fila] = await m.query(`SELECT ${COLUMNAS_EVACUACION} FROM evacuaciones WHERE id = $1${bloquear ? ' FOR UPDATE' : ''}`, [id]);
    if (!fila) throw new NotFoundException({ codigo: 'EVACUACION_NO_ENCONTRADA', mensaje: 'La evacuación no existe.' });
    return fila;
  }

  private zonasDe(m: EntityManager, id: string): Promise<FilaZona[]> {
    return m.query(`SELECT ${COLUMNAS_ZONA} FROM evacuacion_zonas WHERE evacuacion_id = $1 ORDER BY nombre`, [id]);
  }

  private salidasDe(m: EntityManager, recintoId: string): Promise<Salida[]> {
    return m.query(
      `SELECT id, nombre, capacidad_por_minuto AS "capacidadPorMinuto", habilitada, motivo_bloqueo AS "motivoBloqueo"
         FROM salidas_emergencia WHERE recinto_id = $1 ORDER BY nombre`, [recintoId]);
  }

  private rutasDe(m: EntityManager, recintoId: string): Promise<Ruta[]> {
    return m.query(
      `SELECT r.id, r.zona_id AS "zonaId", r.salida_id AS "salidaId", s.nombre AS salida, r.prioridad, r.descripcion
         FROM rutas_evacuacion r JOIN salidas_emergencia s ON s.id = r.salida_id
        WHERE r.recinto_id = $1 ORDER BY r.zona_id, r.prioridad`, [recintoId]);
  }
}

function instruccion(zona: string, ruta: Pick<Ruta, 'salida' | 'descripcion'> | null): string {
  if (!ruta) return `Zona «${zona}»: no hay una salida habilitada. Espere las indicaciones del personal.`;
  return `Zona «${zona}»: evacúe por «${ruta.salida}».${ruta.descripcion ? ` ${ruta.descripcion}` : ''}`;
}
