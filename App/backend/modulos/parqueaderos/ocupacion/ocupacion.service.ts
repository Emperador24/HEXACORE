import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { EventosService } from '../../eventos-recintos/eventos/eventos.service';
import { RedirigirDto } from '../dto/parqueaderos.dto';
import { CONEXION_PARQUEADEROS } from '../persistencia/conexion';

/** Umbrales del panel (paso 3-4). Fijos y a la vista, como en el monitoreo. */
export const UMBRALES_PARQUEADERO = {
  /** Porcentaje desde el que una zona "se aproxima al límite". */
  casiLlena: 85,
  /** Ventana para la tendencia (velocidad de llenado). */
  ventanaMinutos: 15,
  /** Avisar si a este ritmo la zona se llena en menos de estos minutos. */
  minutosParaLlenarse: 15,
} as const;

export type EstadoZona = 'DISPONIBLE' | 'CASI_LLENA' | 'LLENA';

export interface ZonaConOcupacion {
  id: string; nombre: string; capacidad: number; orden: number;
  /** Vehículos dentro y espacios retenidos por reservas vigentes (CU-021). */
  ocupados: number; reservados: number; disponibles: number; porcentaje: number; estado: EstadoZona;
  tendencia: { ingresos: number; salidas: number; netoPorMinuto: number; minutosParaLlenarse: number | null };
}

export interface AlertaParqueadero {
  tipo: 'ZONA_LLENA' | 'ZONA_CASI_LLENA' | 'LLENADO_RAPIDO';
  severidad: 'aviso' | 'critica';
  zonaId: string;
  mensaje: string;
  sugerencia?: { zonaDestinoId: string; zona: string; texto: string };
}

/**
 * CU-025: Control de ocupación del parqueadero.
 *
 * La ocupación se calcula de las estancias abiertas al leer, sin contador
 * aparte que pueda desincronizarse; los índices parciales por zona la hacen
 * barata. Un espacio reservado (CU-021) no está ocupado pero tampoco
 * disponible: cuenta para el porcentaje y para llenar la zona. La tendencia es el saldo de ingresos menos salidas en los últimos
 * `ventanaMinutos`. La recomendación que ven los operadores de ingreso
 * (paso 7) es la redirección vigente si su destino tiene espacio; si no, la
 * zona menos ocupada.
 */
@Injectable()
export class OcupacionService {
  constructor(
    @InjectDataSource(CONEXION_PARQUEADEROS) private readonly datos: DataSource,
    private readonly eventos: EventosService,
  ) {}

  /** Pasos 2-4 y 7: el panel completo de un evento. */
  async panel(eventoId: string) {
    const { evento } = await this.eventos.detalle(eventoId);
    const ahora = new Date();
    const zonas = await this.estadoZonas(this.datos.manager, eventoId);
    const [recomendacion, redirecciones] = await Promise.all([
      this.recomendacion(this.datos.manager, eventoId, zonas),
      this.redirecciones(eventoId),
    ]);
    const capacidad = zonas.reduce((n, z) => n + z.capacidad, 0);
    const ocupados = zonas.reduce((n, z) => n + z.ocupados, 0);
    const reservados = zonas.reduce((n, z) => n + z.reservados, 0);
    return {
      evento: {
        id: evento.id, nombre: evento.nombre, fechaInicio: evento.fechaInicio, fechaFin: evento.fechaFin,
        enCurso: evento.fechaInicio <= ahora && evento.fechaFin > ahora,
      },
      total: {
        capacidad, ocupados, reservados, disponibles: Math.max(0, capacidad - ocupados - reservados),
        porcentaje: capacidad ? redondear(((ocupados + reservados) / capacidad) * 100) : 0,
      },
      zonas,
      alertas: this.evaluar(zonas),
      recomendacion,
      redirecciones,
      umbrales: UMBRALES_PARQUEADERO,
      actualizadoEn: ahora,
    };
  }

  /** Resumen para el panel del evento (CU-019), por interfaz local. */
  async resumen(eventoId: string) {
    const zonas = await this.estadoZonas(this.datos.manager, eventoId);
    const capacidad = zonas.reduce((n, z) => n + z.capacidad, 0);
    const ocupados = zonas.reduce((n, z) => n + z.ocupados, 0);
    const reservados = zonas.reduce((n, z) => n + z.reservados, 0);
    return {
      zonas: zonas.map(({ id, nombre, capacidad, ocupados, reservados, porcentaje, estado }) => ({ id, nombre, capacidad, ocupados, reservados, porcentaje, estado })),
      capacidad, ocupados, reservados, porcentaje: capacidad ? redondear(((ocupados + reservados) / capacidad) * 100) : 0,
      alertas: this.evaluar(zonas),
    };
  }

  async estadoZonas(m: EntityManager, eventoId: string): Promise<ZonaConOcupacion[]> {
    const filas: { id: string; nombre: string; capacidad: number; orden: number; ocupados: number; reservados: number; ingresos: number; salidas: number }[] = await m.query(
      `SELECT z.id, z.nombre, z.capacidad, z.orden,
              count(e.id) FILTER (WHERE e.salida_en IS NULL)::int AS ocupados,
              (SELECT count(*)::int FROM reservas r WHERE r.zona_id = z.id AND r.estado IN ('PENDIENTE_PAGO', 'PAGANDO', 'CONFIRMADA')) AS reservados,
              count(e.id) FILTER (WHERE e.ingreso_en > now() - make_interval(mins => $2))::int AS ingresos,
              count(e.id) FILTER (WHERE e.salida_en > now() - make_interval(mins => $2))::int AS salidas
         FROM zonas_parqueadero z
         LEFT JOIN estancias e ON e.zona_id = z.id AND (e.salida_en IS NULL OR e.salida_en > now() - make_interval(mins => $2) OR e.ingreso_en > now() - make_interval(mins => $2))
        WHERE z.evento_id = $1
        GROUP BY z.id
        ORDER BY z.orden, z.nombre`,
      [eventoId, UMBRALES_PARQUEADERO.ventanaMinutos],
    );
    return filas.map((f) => {
      const comprometidos = f.ocupados + f.reservados;
      const disponibles = Math.max(0, f.capacidad - comprometidos);
      const porcentaje = redondear((comprometidos / f.capacidad) * 100);
      const netoPorMinuto = redondear((f.ingresos - f.salidas) / UMBRALES_PARQUEADERO.ventanaMinutos);
      return {
        ...f,
        disponibles,
        porcentaje,
        estado: comprometidos >= f.capacidad ? 'LLENA' : porcentaje >= UMBRALES_PARQUEADERO.casiLlena ? 'CASI_LLENA' : 'DISPONIBLE',
        tendencia: {
          ingresos: f.ingresos, salidas: f.salidas, netoPorMinuto,
          minutosParaLlenarse: netoPorMinuto > 0 && disponibles > 0 ? Math.ceil(disponibles / netoPorMinuto) : null,
        },
      };
    });
  }

  /** Paso 7: la zona que se recomienda a los operadores de ingreso, y por qué. */
  async recomendacion(m: EntityManager, eventoId: string, zonas?: ZonaConOcupacion[]) {
    const estado = zonas ?? (await this.estadoZonas(m, eventoId));
    const [vigente] = await m.query(`SELECT id, zona_origen_id AS "zonaOrigenId", zona_destino_id AS "zonaDestinoId", motivo FROM redirecciones WHERE evento_id = $1 AND vigente`, [eventoId]);
    const destino = vigente && estado.find((z) => z.id === vigente.zonaDestinoId && z.estado !== 'LLENA');
    if (destino) return { zona: resumenZona(destino), motivo: 'REDIRECCION' as const, redireccionId: vigente.id as string };
    const libre = estado.filter((z) => z.estado !== 'LLENA').sort((a, b) => a.porcentaje - b.porcentaje || a.orden - b.orden)[0];
    return libre ? { zona: resumenZona(libre), motivo: 'MENOS_OCUPADA' as const, redireccionId: null } : { zona: null, motivo: 'SIN_ESPACIO' as const, redireccionId: null };
  }

  /** Pasos 6-8: el supervisor redirige los ingresos; reemplaza a la redirección vigente. */
  async redirigir(eventoId: string, dto: RedirigirDto, usuario: string) {
    await this.datos.transaction(async (m) => {
      const zonas = await this.estadoZonas(m, eventoId);
      const destino = zonas.find((z) => z.id === dto.zonaDestinoId);
      if (!destino) throw new NotFoundException({ codigo: 'ZONA_NO_ENCONTRADA', mensaje: 'La zona destino no es de este evento.' });
      if (dto.zonaOrigenId && !zonas.some((z) => z.id === dto.zonaOrigenId)) {
        throw new NotFoundException({ codigo: 'ZONA_NO_ENCONTRADA', mensaje: 'La zona de origen no es de este evento.' });
      }
      if (dto.zonaOrigenId === dto.zonaDestinoId) throw new BadRequestException({ codigo: 'REDIRECCION_INVALIDA', mensaje: 'El destino debe ser otra zona.' });
      if (destino.estado === 'LLENA') throw new ConflictException({ codigo: 'ZONA_LLENA', mensaje: `«${destino.nombre}» está llena: no puede recibir vehículos.` });
      await m.query(`UPDATE redirecciones SET vigente = false, terminada_en = now() WHERE evento_id = $1 AND vigente`, [eventoId]);
      await m.query(
        `INSERT INTO redirecciones (evento_id, zona_origen_id, zona_destino_id, motivo, realizado_por) VALUES ($1, $2, $3, $4, $5)`,
        [eventoId, dto.zonaOrigenId ?? null, dto.zonaDestinoId, dto.motivo.trim(), usuario]);
    });
    return this.panel(eventoId);
  }

  /** Paso 8: el resultado de la redirección, y si con eso termina. */
  async resultado(eventoId: string, redireccionId: string, resultado: string, terminar: boolean) {
    // En Postgres, TypeORM devuelve [filas, cantidad] para un UPDATE.
    const [, cantidad] = await this.datos.query(
      `UPDATE redirecciones SET resultado = $3,
              terminada_en = CASE WHEN $4 AND vigente THEN now() ELSE terminada_en END,
              vigente = CASE WHEN $4 THEN false ELSE vigente END
        WHERE id = $1 AND evento_id = $2`,
      [redireccionId, eventoId, resultado.trim(), terminar]);
    if (!cantidad) throw new NotFoundException({ codigo: 'REDIRECCION_NO_ENCONTRADA', mensaje: 'La redirección no existe.' });
    return this.panel(eventoId);
  }

  /** Historial de redirecciones, con cuántos vehículos llegaron al destino mientras estuvo vigente. */
  redirecciones(eventoId: string) {
    return this.datos.query(
      `SELECT r.id, r.zona_origen_id AS "zonaOrigenId", o.nombre AS "zonaOrigen", r.zona_destino_id AS "zonaDestinoId", d.nombre AS "zonaDestino",
              r.motivo, r.vigente, r.resultado, r.realizado_por AS "realizadoPor", r.fecha, r.terminada_en AS "terminadaEn",
              (SELECT count(*)::int FROM estancias e WHERE e.zona_id = r.zona_destino_id AND e.ingreso_en >= r.fecha
                  AND (r.terminada_en IS NULL OR e.ingreso_en < r.terminada_en)) AS "ingresosAlDestino"
         FROM redirecciones r
         JOIN zonas_parqueadero d ON d.id = r.zona_destino_id
         LEFT JOIN zonas_parqueadero o ON o.id = r.zona_origen_id
        WHERE r.evento_id = $1
        ORDER BY r.fecha DESC
        LIMIT 50`,
      [eventoId]);
  }

  /** Paso 4 y CU-025A. */
  private evaluar(zonas: ZonaConOcupacion[]): AlertaParqueadero[] {
    const alertas: AlertaParqueadero[] = [];
    // Paso 6: hacia dónde redirigir, si hay una zona con margen.
    const sugerir = (desde: ZonaConOcupacion) => {
      const otra = zonas.filter((z) => z.id !== desde.id && z.estado === 'DISPONIBLE').sort((a, b) => b.disponibles - a.disponibles)[0];
      return otra ? { sugerencia: { zonaDestinoId: otra.id, zona: otra.nombre, texto: `Redirige los ingresos a «${otra.nombre}» (${otra.disponibles} libres).` } } : {};
    };
    for (const z of zonas) {
      if (z.estado === 'LLENA') {
        alertas.push({ tipo: 'ZONA_LLENA', severidad: 'critica', zonaId: z.id, mensaje: `«${z.nombre}» está llena (${z.ocupados}/${z.capacidad}${z.reservados ? ` y ${z.reservados} reservados` : ''}): no admite más ingresos.`, ...sugerir(z) });
      } else if (z.estado === 'CASI_LLENA') {
        alertas.push({ tipo: 'ZONA_CASI_LLENA', severidad: 'aviso', zonaId: z.id, mensaje: `«${z.nombre}» al ${z.porcentaje} % (${z.disponibles} libres).`, ...sugerir(z) });
      } else if (z.tendencia.minutosParaLlenarse !== null && z.tendencia.minutosParaLlenarse <= UMBRALES_PARQUEADERO.minutosParaLlenarse) {
        alertas.push({ tipo: 'LLENADO_RAPIDO', severidad: 'aviso', zonaId: z.id, mensaje: `A este ritmo «${z.nombre}» se llena en unos ${z.tendencia.minutosParaLlenarse} min.`, ...sugerir(z) });
      }
    }
    return alertas;
  }
}

function resumenZona(z: ZonaConOcupacion) {
  return { id: z.id, nombre: z.nombre, disponibles: z.disponibles, porcentaje: z.porcentaje };
}

function redondear(n: number) {
  return Math.round(n * 10) / 10;
}
