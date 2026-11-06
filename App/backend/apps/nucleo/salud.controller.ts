import { CONEXION_PAGOS } from '../../modulos/finanzas/pagos/persistencia/conexion';
import { CONEXION_LOGISTICA } from '../../modulos/personal-logistica/persistencia/conexion';
import { Controller, Get, Inject, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Response } from 'express';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { CONFIGURACION_PROCESO, ConfiguracionProceso } from '../../compartido/config/configuracion';
import { ConexionRabbitMq } from '../../compartido/rabbitmq/conexion-rabbitmq.service';
import { REDIS } from '../../compartido/redis/redis.module';
import { CONEXION_IDENTIDAD } from '../../modulos/identidad/persistencia/conexion';
import { CONEXION_ALIMENTOS } from '../../modulos/alimentos/persistencia/conexion';
import { CONEXION_EVENTOS } from '../../modulos/eventos-recintos/persistencia/conexion';
import { CONEXION_OPERACION } from '../../modulos/operacion/persistencia/conexion';
import { CONEXION_PARQUEADEROS } from '../../modulos/parqueaderos/persistencia/conexion';

@Controller('salud')
export class SaludController {
  private readonly arranque = Date.now();
  constructor(
    @Inject(CONFIGURACION_PROCESO) private readonly config: ConfiguracionProceso,
    @InjectDataSource(CONEXION_IDENTIDAD) private readonly identidad: DataSource,
    @InjectDataSource(CONEXION_ALIMENTOS) private readonly alimentos: DataSource,
    @InjectDataSource(CONEXION_LOGISTICA) private readonly logistica: DataSource,
    @InjectDataSource(CONEXION_PAGOS) private readonly pagos: DataSource,
    @InjectDataSource(CONEXION_EVENTOS) private readonly eventos: DataSource,
    @InjectDataSource(CONEXION_OPERACION) private readonly operacion: DataSource,
    @InjectDataSource(CONEXION_PARQUEADEROS) private readonly parqueaderos: DataSource,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly rabbit: ConexionRabbitMq,
  ) {}

  @Get()
  async estado(@Res({ passthrough: true }) respuesta: Response) {
    const [identidad, alimentos, logistica, pagos, eventos, operacion, parqueaderos, redis] = await Promise.all([
      this.responde(() => this.identidad.query('SELECT 1 FROM identidad.migraciones LIMIT 1')),
      this.responde(() => this.alimentos.query('SELECT 1 FROM alimentos.migraciones LIMIT 1')),
      this.responde(() => this.logistica.query('SELECT 1 FROM personal_logistica.migraciones LIMIT 1')),
      this.responde(() => this.pagos.query('SELECT 1 FROM finanzas_pagos.migraciones LIMIT 1')),
      this.responde(() => this.eventos.query('SELECT 1 FROM eventos_recintos.migraciones LIMIT 1')),
      this.responde(() => this.operacion.query('SELECT 1 FROM operacion.migraciones LIMIT 1')),
      this.responde(() => this.parqueaderos.query('SELECT 1 FROM parqueaderos.migraciones LIMIT 1')),
      this.responde(() => this.redis.ping()),
    ]);
    // Redis es necesario para aceptar reservas. Rabbit se informa como antes.
    const listo = identidad && alimentos && logistica && pagos && eventos && operacion && parqueaderos && redis;
    respuesta.status(listo ? 200 : 503);
    return {
      servicio: 'nucleo', entorno: this.config.entorno,
      estado: listo && this.rabbit.conectado ? 'arriba' : 'degradado',
      dependencias: {
        postgres: { identidad: identidad ? 'arriba' : 'caido', alimentos: alimentos ? 'arriba' : 'caido', logistica: logistica ? 'arriba' : 'caido', pagos: pagos ? 'arriba' : 'caido', eventos: eventos ? 'arriba' : 'caido', operacion: operacion ? 'arriba' : 'caido', parqueaderos: parqueaderos ? 'arriba' : 'caido' },
        redis: redis ? 'arriba' : 'caido', rabbitmq: this.rabbit.conectado ? 'arriba' : 'caido',
      },
      tiempoActivoSegundos: Math.floor((Date.now() - this.arranque) / 1000), marcaDeTiempo: new Date().toISOString(),
    };
  }

  private async responde(accion: () => Promise<unknown>): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        accion().then(() => true, () => false),
        new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), 1000); }),
      ]);
    } finally { clearTimeout(timer); }
  }
}
