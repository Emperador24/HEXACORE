import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CONEXION_LOGISTICA } from '../persistencia/conexion';

export interface CoberturaZona {
  zonaId: string;
  nombre: string;
  rolRequerido: string;
  requeridos: number;
  asignados: number;
  confirmados: number;
  /** Con entrada registrada en su turno y sin salida (CU-018). */
  presentes: number;
}

/**
 * Interfaz local de solo lectura para el monitoreo (CU-019): cobertura de
 * personal por zona de un evento. Es lo único que Personal/Logística expone a
 * otros módulos del Núcleo; nadie más lee sus tablas.
 */
@Injectable()
export class CoberturaPersonalService {
  constructor(@InjectDataSource(CONEXION_LOGISTICA) private readonly datos: DataSource) {}

  async deEvento(eventoId: string): Promise<CoberturaZona[]> {
    const filas = await this.datos.query(
      `SELECT z.id AS "zonaId", z.nombre, z."rolRequerido", z."personalRequerido" AS requeridos,
              count(t.id) FILTER (WHERE t.estado <> 'CANCELADO')::int AS asignados,
              count(t.id) FILTER (WHERE t.estado <> 'CANCELADO' AND t.confirmacion = 'CONFIRMADA')::int AS confirmados,
              count(t.id) FILTER (WHERE t.estado <> 'CANCELADO'
                AND EXISTS (SELECT 1 FROM registros_asistencia r WHERE r."turnoId" = t.id AND r.tipo = 'ENTRADA')
                AND NOT EXISTS (SELECT 1 FROM registros_asistencia r WHERE r."turnoId" = t.id AND r.tipo = 'SALIDA'))::int AS presentes
         FROM zonas_evento z
         LEFT JOIN turnos t ON t."zonaEventoId" = z.id
        WHERE z."eventoId" = $1
        GROUP BY z.id
        ORDER BY z.nombre`,
      [eventoId],
    );
    return filas as CoberturaZona[];
  }
}
