import { ArgumentsHost, Catch, Logger, OnModuleDestroy } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { DataSource, QueryFailedError } from 'typeorm';
import { CONEXION_IDENTIDAD } from '../../modulos/identidad/persistencia/conexion';
import { CONEXION_ALIMENTOS } from '../../modulos/alimentos/persistencia/conexion';
import { CONEXION_LOGISTICA } from '../../modulos/personal-logistica/persistencia/conexion';
import { CONEXION_PAGOS } from '../../modulos/finanzas/pagos/persistencia/conexion';
import { CONEXION_EVENTOS } from '../../modulos/eventos-recintos/persistencia/conexion';
import { CONEXION_OPERACION } from '../../modulos/operacion/persistencia/conexion';
import { CONEXION_PARQUEADEROS } from '../../modulos/parqueaderos/persistencia/conexion';

type PoolPg = { totalCount: number; idleCount: number; waitingCount: number; options?: { max?: number; application_name?: string } };
/** Solo contadores locales; no consulta SQL ni registra sentencias, parámetros o tokens. */
export function contadoresPool(datos: DataSource) {
  const pool = (datos.driver as unknown as { master?: PoolPg }).master;
  return { conexion: pool?.options?.application_name ?? (datos.options as { name?: string }).name ?? 'sin-nombre', total: pool?.totalCount ?? null, libres: pool?.idleCount ?? null,
    esperando: pool?.waitingCount ?? null, maximo: pool?.options?.max ?? null };
}

@Catch(QueryFailedError)
export class DiagnosticoPgFilter extends BaseExceptionFilter implements OnModuleDestroy {
  private readonly log = new Logger('DiagnosticoPG');
  private readonly bucle = monitorEventLoopDelay({ resolution: 20 });
  private readonly fuentes: DataSource[];
  constructor(adaptador: HttpAdapterHost,
    @InjectDataSource(CONEXION_IDENTIDAD) identidad: DataSource,
    @InjectDataSource(CONEXION_ALIMENTOS) alimentos: DataSource,
    @InjectDataSource(CONEXION_LOGISTICA) logistica: DataSource,
    @InjectDataSource(CONEXION_PAGOS) pagos: DataSource,
    @InjectDataSource(CONEXION_EVENTOS) eventos: DataSource,
    @InjectDataSource(CONEXION_OPERACION) operacion: DataSource,
    @InjectDataSource(CONEXION_PARQUEADEROS) parqueaderos: DataSource) {
    super(adaptador.httpAdapter);
    this.fuentes = [identidad, alimentos, logistica, pagos, eventos, operacion, parqueaderos];
    this.bucle.enable();
  }
  onModuleDestroy() { this.bucle.disable(); }
  catch(error: QueryFailedError, host: ArgumentsHost) {
    const driver = error.driverError as { code?: string; message?: string };
    const memoria = process.memoryUsage();
    const ms = (ns: number) => Number.isFinite(ns) ? Math.round(ns / 1e6 * 100) / 100 : null;
    this.log.error(JSON.stringify({ evento: 'FALLO_SQL', instante: new Date().toISOString(),
      codigo: driver.code ?? (driver.message === 'Query read timeout' ? 'QUERY_READ_TIMEOUT' : 'NO_CLASIFICADO'),
      etapa: error.query.trim().split(/\s+/)[0].toUpperCase(), pools: this.fuentes.map(contadoresPool),
      bucleMs: { maximo: ms(this.bucle.max), p99: ms(this.bucle.percentile(99)), media: ms(this.bucle.mean) },
      memoriaBytes: { rss: memoria.rss, heapUsado: memoria.heapUsed } }));
    this.bucle.reset();
    // Conservar el manejo HTTP 500 estándar, sin tratarlo como resultado de negocio.
    super.catch(error, host);
  }
}
