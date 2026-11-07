import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { EventosService } from '../../eventos-recintos/eventos/eventos.service';
import { OcupacionService } from '../../parqueaderos/ocupacion/ocupacion.service';
import { CoberturaPersonalService, CoberturaZona } from '../../personal-logistica/turnos-asistencia/cobertura-personal.service';
import { CONEXION_OPERACION } from '../persistencia/conexion';
import { Alerta, Severidad } from '../persistencia/entidades/alerta.entity';
import { Decision, TipoDecision } from '../persistencia/entidades/decision.entity';
import { EstadoPuntoAcceso, PuntoAcceso } from '../persistencia/entidades/punto-acceso.entity';
import { RegistrarDecisionDto } from './dto/decision.dto';

/** Umbrales de las alertas (paso 4). Fijos y a la vista: se discuten con quien opera. */
export const UMBRALES = {
  aforoAlto: 0.9,
  /** Ingresos por un punto en 5 min para considerarlo congestionado (CU-019B)… */
  congestionMinima: 30,
  /** …y cuántas veces el promedio de los demás puntos habilitados. */
  congestionRelativa: 2,
  /** CU-019C: sin ingresos en 10 min un punto que en la última hora tuvo al menos estos… */
  actividadPrevia: 5,
  /** …mientras los demás sí registran al menos estos en esos 10 min. */
  actividadOtros: 5,
} as const;

export interface AlertaCalculada {
  tipo: string;
  clave: string;
  severidad: Severidad;
  mensaje: string;
  sugerencia?: Record<string, unknown>;
}

export interface PuntoConFlujo {
  nombre: string;
  estado: EstadoPuntoAcceso;
  alternativa: string | null;
  total: number;
  ultimos5: number;
  ultimos10: number;
  ultimaHora: number;
  ultimoIngreso: Date | null;
}

/**
 * CU-019: Monitorear el evento.
 *
 * Reúne, para un evento, lo que el panel muestra (paso 2), calcula los
 * indicadores (paso 3) y las alertas (paso 4), y registra las decisiones del
 * supervisor (pasos 7-8). Las fuentes:
 *
 * - Evento y aforo máximo: eventos-recintos (CU-026), por interfaz local.
 * - Aforo actual y accesos: la copia de ingresos de Acceso QR (`ingresos`).
 * - Personal: cobertura por zona de Personal/Logística (CU-017/018).
 * - Parqueaderos: ocupación por zona de CU-025, por interfaz local.
 * - Incidencias (CU-020): todavía no existen; el panel lo dice en vez de
 *   mostrar ceros.
 */
@Injectable()
export class PanelService {
  constructor(
    @InjectDataSource(CONEXION_OPERACION) private readonly datos: DataSource,
    private readonly eventos: EventosService,
    private readonly cobertura: CoberturaPersonalService,
    private readonly parqueaderos: OcupacionService,
  ) {}

  /** Eventos que se pueden monitorear: los publicados, primero los que están en curso. */
  async eventosMonitoreables() {
    const ahora = Date.now();
    const publicados = await this.eventos.listar('PUBLICADO');
    return publicados
      .map((e) => ({
        id: e.id,
        nombre: e.nombre,
        recinto: e.recinto?.nombre ?? null,
        ciudad: e.recinto?.ciudad ?? null,
        fechaInicio: e.fechaInicio,
        fechaFin: e.fechaFin,
        aforoMaximo: e.aforoMaximo,
        enCurso: e.fechaInicio.getTime() <= ahora && e.fechaFin.getTime() > ahora,
      }))
      .filter((e) => e.fechaFin.getTime() > ahora - 24 * 3_600_000)
      .sort((a, b) => Number(b.enCurso) - Number(a.enCurso) || a.fechaInicio.getTime() - b.fechaInicio.getTime());
  }

  /** Pasos 2-4: el estado del evento ahora mismo, con sus alertas al día. */
  async panel(eventoId: string) {
    const { evento, recinto } = await this.eventos.detalle(eventoId);
    if (evento.estado !== 'PUBLICADO') {
      throw new ConflictException({ codigo: 'EVENTO_NO_PUBLICADO', mensaje: 'Solo se monitorea un evento publicado.' });
    }
    const ahora = new Date();
    const enCurso = evento.fechaInicio <= ahora && evento.fechaFin > ahora;

    const [puntos, porMinuto, asistentes, zonas, parqueadero] = await Promise.all([
      this.puntosConFlujo(eventoId),
      this.ingresosPorMinuto(eventoId),
      this.datos.query(`SELECT count(*)::int AS n FROM ingresos WHERE evento_id = $1`, [eventoId]).then((r) => r[0].n as number),
      this.cobertura.deEvento(eventoId),
      this.parqueaderos.resumen(eventoId),
    ]);

    const porcentaje = evento.aforoMaximo ? asistentes / evento.aforoMaximo : 0;
    const ultimos5 = puntos.reduce((n, p) => n + p.ultimos5, 0);
    const personal = {
      zonas: zonas.map((z) => ({ ...z, deficit: Math.max(0, z.requeridos - z.presentes) })),
      requeridos: zonas.reduce((n, z) => n + z.requeridos, 0),
      asignados: zonas.reduce((n, z) => n + z.asignados, 0),
      presentes: zonas.reduce((n, z) => n + z.presentes, 0),
    };

    const calculadas = this.evaluar({ porcentaje, asistentes, aforoMaximo: evento.aforoMaximo, puntos, zonas, enCurso });
    const alertas = await this.sincronizarAlertas(eventoId, calculadas);
    const decisiones = await this.datos.getRepository(Decision).find({ where: { eventoId }, order: { fecha: 'DESC' }, take: 50 });

    return {
      evento: {
        id: evento.id, nombre: evento.nombre, fechaInicio: evento.fechaInicio, fechaFin: evento.fechaFin,
        recinto: recinto?.nombre ?? null, ciudad: recinto?.ciudad ?? null, enCurso,
      },
      aforo: { asistentes, aforoMaximo: evento.aforoMaximo, porcentaje: Math.round(porcentaje * 1000) / 10, disponibles: Math.max(0, evento.aforoMaximo - asistentes) },
      accesos: { ultimos5min: ultimos5, flujoPorMinuto: Math.round((ultimos5 / 5) * 10) / 10, porMinuto, puntos },
      personal,
      parqueaderos: parqueadero.zonas.length
        ? { disponible: true, ...parqueadero }
        : { disponible: false, motivo: 'El evento no tiene zonas de parqueadero configuradas (CU-025).' },
      incidencias: { disponible: false, motivo: 'La gestión de incidentes (CU-020) todavía no existe.' },
      alertas,
      decisiones,
      umbrales: UMBRALES,
      actualizadoEn: ahora,
    };
  }

  // --- Paso 4: alertas --------------------------------------------------------

  private evaluar(e: {
    porcentaje: number; asistentes: number; aforoMaximo: number; puntos: PuntoConFlujo[]; zonas: CoberturaZona[]; enCurso: boolean;
  }): AlertaCalculada[] {
    const alertas: AlertaCalculada[] = [];
    if (e.porcentaje >= 1) {
      // CU-019A: el bloqueo lo hace Acceso QR al validar (CU-002B); aquí se avisa.
      alertas.push({
        tipo: 'AFORO_COMPLETO', clave: 'AFORO', severidad: 'critica',
        mensaje: `Aforo completo (${e.asistentes}/${e.aforoMaximo}). Acceso QR rechaza los nuevos ingresos.`,
      });
    } else if (e.porcentaje >= UMBRALES.aforoAlto) {
      alertas.push({
        tipo: 'AFORO_ALTO', clave: 'AFORO', severidad: 'aviso',
        mensaje: `Aforo al ${Math.round(e.porcentaje * 100)} % (${e.asistentes}/${e.aforoMaximo}).`,
      });
    }

    const habilitados = e.puntos.filter((p) => p.estado === EstadoPuntoAcceso.HABILITADO);
    // Personal que sobra en alguna zona: es de donde sale el refuerzo.
    const sobrantes = e.zonas.filter((z) => z.presentes > z.requeridos).map((z) => ({ zona: z.nombre, sobran: z.presentes - z.requeridos }));

    for (const p of habilitados) {
      const otros = habilitados.filter((o) => o.nombre !== p.nombre);
      const promedioOtros = otros.length ? otros.reduce((n, o) => n + o.ultimos5, 0) / otros.length : 0;
      if (p.ultimos5 >= UMBRALES.congestionMinima && (otros.length === 0 || p.ultimos5 >= UMBRALES.congestionRelativa * Math.max(promedioOtros, 1))) {
        // Solo se sugiere un acceso que esté registrando: uno callado puede estar fallando (CU-019C).
        const menosCargado = otros.filter((o) => o.ultimos10 > 0).sort((a, b) => a.ultimos5 - b.ultimos5)[0];
        alertas.push({
          tipo: 'CONGESTION', clave: `CONGESTION:${p.nombre}`, severidad: 'aviso',
          mensaje: `Congestión en «${p.nombre}»: ${p.ultimos5} ingresos en 5 min${otros.length ? ` (los demás promedian ${Math.round(promedioOtros)})` : ''}.`,
          // CU-019B: redistribuir personal hacia ese acceso.
          sugerencia: {
            accion: 'REDISTRIBUIR_PERSONAL',
            hacia: p.nombre,
            desde: sobrantes,
            texto: sobrantes.length
              ? `Mueve personal de ${sobrantes.map((s) => `«${s.zona}» (${s.sobran} de más)`).join(', ')} a «${p.nombre}».`
              : menosCargado
                ? `No sobra personal en ninguna zona: considera desviar gente hacia «${menosCargado.nombre}».`
                : 'No sobra personal en ninguna zona.',
          },
        });
      }

      const otrosActivos = otros.reduce((n, o) => n + o.ultimos10, 0);
      if (e.enCurso && p.ultimaHora >= UMBRALES.actividadPrevia && p.ultimos10 === 0 && otrosActivos >= UMBRALES.actividadOtros) {
        const alternativa = otros.filter((o) => o.ultimos10 > 0).sort((a, b) => a.ultimos5 - b.ultimos5)[0]?.nombre ?? null;
        alertas.push({
          tipo: 'ACCESO_SIN_ACTIVIDAD', clave: `SIN_ACTIVIDAD:${p.nombre}`, severidad: 'critica',
          mensaje: `«${p.nombre}» no registra ingresos hace 10 min y los demás sí: puede estar fallando.`,
          // CU-019C: cerrar ese acceso y habilitar una entrada alternativa.
          sugerencia: { accion: 'CERRAR_ACCESO', punto: p.nombre, alternativa, texto: alternativa ? `Cierra «${p.nombre}» y envía a la gente por «${alternativa}».` : `Cierra «${p.nombre}» y habilita otra entrada.` },
        });
      }
    }

    if (e.enCurso) {
      for (const z of e.zonas) {
        if (z.presentes < z.requeridos) {
          alertas.push({
            tipo: 'PERSONAL_INSUFICIENTE', clave: `PERSONAL:${z.zonaId}`, severidad: 'aviso',
            mensaje: `«${z.nombre}» tiene ${z.presentes} de ${z.requeridos} personas presentes.`,
          });
        }
      }
    }
    return alertas;
  }

  /**
   * Deja en la base exactamente las alertas activas que se calcularon: crea las
   * nuevas, actualiza el texto de las que siguen y resuelve las que ya no
   * aplican. El índice único parcial impide duplicados si dos pantallas
   * calculan a la vez.
   */
  private async sincronizarAlertas(eventoId: string, calculadas: AlertaCalculada[]): Promise<Alerta[]> {
    return this.datos.transaction(async (m) => {
      const activas = await m.find(Alerta, { where: { eventoId, resueltaEn: IsNull() } });
      const claves = new Set(calculadas.map((c) => c.clave));
      for (const vieja of activas.filter((a) => !claves.has(a.clave))) {
        await m.update(Alerta, { id: vieja.id }, { resueltaEn: new Date() });
      }
      for (const c of calculadas) {
        const existente = activas.find((a) => a.clave === c.clave);
        if (existente) {
          if (existente.mensaje !== c.mensaje || existente.tipo !== c.tipo || existente.severidad !== c.severidad) {
            await m.query(`UPDATE alertas SET mensaje=$2, tipo=$3, severidad=$4, sugerencia=$5 WHERE id=$1`, [existente.id, c.mensaje, c.tipo, c.severidad, c.sugerencia ? JSON.stringify(c.sugerencia) : null]);
          }
        } else {
          await m.query(
            `INSERT INTO alertas (evento_id, tipo, clave, severidad, mensaje, sugerencia) VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (evento_id, clave) WHERE resuelta_en IS NULL DO NOTHING`,
            [eventoId, c.tipo, c.clave, c.severidad, c.mensaje, c.sugerencia ? JSON.stringify(c.sugerencia) : null],
          );
        }
      }
      const orden: Record<Severidad, number> = { critica: 0, aviso: 1, info: 2 };
      return (await m.find(Alerta, { where: { eventoId, resueltaEn: IsNull() }, order: { creadaEn: 'ASC' } }))
        .sort((a, b) => orden[a.severidad] - orden[b.severidad]);
    });
  }

  /** Alertas ya resueltas, para el historial del evento. */
  historialAlertas(eventoId: string) {
    return this.datos.getRepository(Alerta).find({ where: { eventoId }, order: { creadaEn: 'DESC' }, take: 100 });
  }

  // --- Pasos 7-8: decisiones -----------------------------------------------------

  async registrarDecision(eventoId: string, dto: RegistrarDecisionDto, realizadoPor: string) {
    const { evento } = await this.eventos.detalle(eventoId);
    if (evento.estado !== 'PUBLICADO') throw new ConflictException({ codigo: 'EVENTO_NO_PUBLICADO', mensaje: 'Solo se registran decisiones de un evento publicado.' });

    return this.datos.transaction(async (m) => {
      if (dto.alertaId) {
        const alerta = await m.findOneBy(Alerta, { id: dto.alertaId, eventoId });
        if (!alerta) throw new BadRequestException('La alerta no es de este evento.');
      }
      if (dto.tipo === TipoDecision.CERRAR_ACCESO) await this.cerrarAcceso(m, eventoId, dto, realizadoPor);
      if (dto.tipo === TipoDecision.HABILITAR_ACCESO) await this.habilitarAcceso(m, eventoId, dto.puntoAcceso, realizadoPor);
      return m.save(m.create(Decision, {
        eventoId,
        tipo: dto.tipo,
        descripcion: dto.descripcion.trim(),
        zona: dto.zona?.trim() || null,
        puntoAcceso: dto.puntoAcceso?.trim() || null,
        alternativa: dto.alternativa?.trim() || null,
        alertaId: dto.alertaId ?? null,
        realizadoPor,
      }));
    });
  }

  /** Paso 8: el resultado de una decisión se anota después de tomarla. */
  async registrarResultado(eventoId: string, decisionId: string, resultado: string) {
    const decision = await this.datos.getRepository(Decision).findOneBy({ id: decisionId, eventoId });
    if (!decision) throw new NotFoundException({ codigo: 'DECISION_NO_ENCONTRADA', mensaje: 'La decisión no existe.' });
    decision.resultado = resultado.trim();
    decision.resultadoEn = new Date();
    return this.datos.getRepository(Decision).save(decision);
  }

  /** CU-019C: cerrar un acceso exige una alternativa habilitada, que se abre si hacía falta. */
  private async cerrarAcceso(m: EntityManager, eventoId: string, dto: RegistrarDecisionDto, realizadoPor: string) {
    const punto = dto.puntoAcceso?.trim();
    const alternativa = dto.alternativa?.trim();
    if (!punto) throw new BadRequestException({ codigo: 'FALTA_PUNTO', mensaje: 'Indica qué acceso se cierra.' });
    if (!alternativa) throw new BadRequestException({ codigo: 'FALTA_ALTERNATIVA', mensaje: 'Indica la entrada alternativa que recibe a la gente.' });
    if (alternativa.toLowerCase() === punto.toLowerCase()) throw new BadRequestException({ codigo: 'ALTERNATIVA_INVALIDA', mensaje: 'La alternativa debe ser otro acceso.' });
    await this.habilitarAcceso(m, eventoId, alternativa, realizadoPor);
    await m.query(
      `INSERT INTO puntos_acceso (evento_id, nombre, estado, alternativa, actualizado_por, actualizado_en) VALUES ($1,$2,'CERRADO',$3,$4,now())
       ON CONFLICT (evento_id, nombre) DO UPDATE SET estado='CERRADO', alternativa=EXCLUDED.alternativa, actualizado_por=EXCLUDED.actualizado_por, actualizado_en=now()`,
      [eventoId, punto, alternativa, realizadoPor],
    );
  }

  private async habilitarAcceso(m: EntityManager, eventoId: string, nombre: string | undefined, realizadoPor: string) {
    const punto = nombre?.trim();
    if (!punto) throw new BadRequestException({ codigo: 'FALTA_PUNTO', mensaje: 'Indica qué acceso se habilita.' });
    await m.query(
      `INSERT INTO puntos_acceso (evento_id, nombre, estado, alternativa, actualizado_por, actualizado_en) VALUES ($1,$2,'HABILITADO',NULL,$3,now())
       ON CONFLICT (evento_id, nombre) DO UPDATE SET estado='HABILITADO', alternativa=NULL, actualizado_por=EXCLUDED.actualizado_por, actualizado_en=now()`,
      [eventoId, punto, realizadoPor],
    );
  }

  // --- Consultas de flujo --------------------------------------------------------

  private async puntosConFlujo(eventoId: string): Promise<PuntoConFlujo[]> {
    const filas = await this.datos.query(
      `SELECT p.nombre, p.estado, p.alternativa,
              count(i.id)::int AS total,
              count(i.id) FILTER (WHERE i.escaneado_en > now() - interval '5 minutes')::int AS ultimos5,
              count(i.id) FILTER (WHERE i.escaneado_en > now() - interval '10 minutes')::int AS ultimos10,
              count(i.id) FILTER (WHERE i.escaneado_en > now() - interval '60 minutes')::int AS "ultimaHora",
              max(i.escaneado_en) AS "ultimoIngreso"
         FROM puntos_acceso p
         LEFT JOIN ingresos i ON i.evento_id = p.evento_id AND i.punto_acceso = p.nombre
        WHERE p.evento_id = $1
        GROUP BY p.evento_id, p.nombre
        ORDER BY p.nombre`,
      [eventoId],
    );
    return filas as PuntoConFlujo[];
  }

  /** Flujo de ingreso de los últimos 30 minutos, minuto a minuto (para la gráfica). */
  private async ingresosPorMinuto(eventoId: string): Promise<{ minuto: string; ingresos: number }[]> {
    return this.datos.query(
      `SELECT to_char(m.minuto AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:00"Z"') AS minuto, count(i.id)::int AS ingresos
         FROM generate_series(date_trunc('minute', now()) - interval '29 minutes', date_trunc('minute', now()), interval '1 minute') AS m(minuto)
         LEFT JOIN ingresos i ON i.evento_id = $1 AND date_trunc('minute', i.escaneado_en) = m.minuto
        GROUP BY m.minuto
        ORDER BY m.minuto`,
      [eventoId],
    );
  }
}
