import { BadRequestException, Injectable } from '@nestjs/common';
import { EventosService } from '../eventos-recintos/eventos/eventos.service';
import { IncidentesService } from '../operacion/incidentes/incidentes.service';
import { AsistenciaService } from '../personal-logistica/turnos-asistencia/asistencia.service';
import { OcupacionService } from '../parqueaderos/ocupacion/ocupacion.service';
import { ConsultarDashboardDto } from './dto/informes.dto';

export type CategoriaMetrica = 'VENTAS' | 'OCUPACION' | 'INGRESOS' | 'PERSONAL' | 'INCIDENTES';

export interface CategoriaDashboard {
  categoria: CategoriaMetrica;
  sinDatos: boolean;
  mensaje?: string;
  datos?: unknown;
}

const TREINTA_DIAS_MS = 30 * 24 * 3_600_000;

/**
 * CU-032: Gestión de Reportes y Analítica del Evento.
 *
 * Informes no tiene esquema propio ni libro que escribir: es una capa de
 * solo lectura que agrega, por interfaz local (ADR-16, sin SQL cruzado entre
 * esquemas), lo que Eventos, Parqueaderos, Personal/Logística y Operación ya
 * calculan cada uno en su propio dominio. Ventas e Ingresos por evento viven
 * en Boletería —un programa separado, sin endpoint interno para esta
 * consulta todavía— así que esas dos categorías se reportan con CU-032A
 * (estado vacío, pero explícito, no un cero engañoso ni un error).
 */
@Injectable()
export class InformesService {
  constructor(
    private readonly eventos: EventosService,
    private readonly ocupacion: OcupacionService,
    private readonly asistencia: AsistenciaService,
    private readonly incidentes: IncidentesService,
  ) {}

  /** CU-032, pasos 1-5: dashboard consolidado de un evento (404 si no existe, vía EventosService). */
  async dashboard(eventoId: string, dto: ConsultarDashboardDto) {
    const { desde, hasta } = this.rango(dto);
    const { evento } = await this.eventos.detalle(eventoId);

    // Ocupación es un corte del presente (CU-025): no se le aplica el rango,
    // a diferencia del resto. Se documenta en la respuesta (ver `rango`).
    const [ocupacion, personal, incidentes] = await Promise.all([
      this.ocupacion.resumen(eventoId),
      this.asistencia.reporte({ eventoId, desde: desde.toISOString(), hasta: hasta.toISOString() }),
      this.incidentes.informe(eventoId, desde, hasta),
    ]);

    const categorias: CategoriaDashboard[] = [
      this.categoria('VENTAS', false, 'Ventas todavía no tiene una interfaz local hacia Boletería desde Informes; pendiente de implementar.'),
      this.categoria('OCUPACION', ocupacion.capacidad > 0, 'No hay zonas de parqueadero configuradas para este evento.', ocupacion),
      this.categoria('INGRESOS', false, 'Ingresos por evento depende de la misma interfaz pendiente de Ventas (el libro de Pagos no distingue por evento).'),
      this.categoria('PERSONAL', personal.totales.empleados > 0, 'No hay turnos de personal registrados en este rango para este evento.', personal),
      this.categoria('INCIDENTES', incidentes.total > 0, 'No hay incidentes registrados en este rango para este evento.', incidentes),
    ];

    return {
      evento: { id: evento.id, nombre: evento.nombre, fechaInicio: evento.fechaInicio, fechaFin: evento.fechaFin, aforoMaximo: evento.aforoMaximo, estado: evento.estado },
      rango: { desde, hasta },
      categorias,
    };
  }

  /** CU-032B: consolida las métricas de varios eventos para comparar entre ellos. */
  async comparativo(eventoIds: string[], dto: ConsultarDashboardDto) {
    const ids = [...new Set(eventoIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length < 2) {
      throw new BadRequestException({ codigo: 'COMPARATIVO_INSUFICIENTE', mensaje: 'Selecciona al menos dos eventos distintos para comparar.' });
    }
    // Secuencial a propósito: cada evento valida y agrega su propio rango;
    // en paralelo multiplicaría sin necesidad la carga sobre Ocupación y
    // Asistencia justo cuando el RNF de rendimiento pide lo contrario.
    const eventos: Awaited<ReturnType<InformesService['dashboard']>>[] = [];
    for (const id of ids) eventos.push(await this.dashboard(id, dto));
    return { eventos };
  }

  /** CU-032, pasos 7-8: exportable. Simplificación deliberada: CSV/JSON, no PDF/Excel binario (ver README). */
  async exportar(eventoId: string, dto: ConsultarDashboardDto, formato: 'csv' | 'json') {
    const reporte = await this.dashboard(eventoId, dto);
    if (formato === 'json') {
      return { contentType: 'application/json', nombreArchivo: `informe-${eventoId}.json`, contenido: JSON.stringify(reporte, null, 2) };
    }
    const filas = ['categoria,sinDatos,resumen'];
    for (const c of reporte.categorias) {
      const resumen = c.sinDatos ? c.mensaje ?? '' : JSON.stringify(c.datos);
      filas.push([c.categoria, String(c.sinDatos), `"${(resumen ?? '').replace(/"/g, '""')}"`].join(','));
    }
    return { contentType: 'text/csv', nombreArchivo: `informe-${eventoId}.csv`, contenido: filas.join('\n') };
  }

  private categoria(categoria: CategoriaMetrica, hayDatos: boolean, mensajeVacio: string, datos?: unknown): CategoriaDashboard {
    if (!hayDatos) return { categoria, sinDatos: true, mensaje: mensajeVacio };
    return { categoria, sinDatos: false, datos };
  }

  /** Entradas del CU-032: rango de fechas. Por defecto, los últimos 30 días hasta ahora. */
  private rango(dto: ConsultarDashboardDto): { desde: Date; hasta: Date } {
    const hasta = dto.hasta ? new Date(dto.hasta) : new Date();
    const desde = dto.desde ? new Date(dto.desde) : new Date(hasta.getTime() - TREINTA_DIAS_MS);
    if (hasta <= desde) {
      throw new BadRequestException({ codigo: 'RANGO_INVALIDO', mensaje: '«hasta» debe ser posterior a «desde».' });
    }
    return { desde, hasta };
  }
}
