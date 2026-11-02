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

@Controller('salud')
export class SaludController {
  private readonly arranque = Date.now();
  constructor(
    @Inject(CONFIGURACION_PROCESO) private readonly config: ConfiguracionProceso,
    @InjectDataSource(CONEXION_IDENTIDAD) private readonly identidad: DataSource,
    @InjectDataSource(CONEXION_ALIMENTOS) private readonly alimentos: DataSource,
    @InjectDataSource(CONEXION_LOGISTICA) private readonly logistica: DataSource,
    @InjectDataSource(CONEXION_PAGOS) private readonly pagos: DataSource,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly rabbit: ConexionRabbitMq,
  ) {}

  @Get()
  async estado(@Res({ passthrough: true }) respuesta: Response) {
    const [identidad, alimentos, logistica, pagos, redis] = await Promise.all([
      this.responde(() => this.identidad.query('SELECT 1')),
      this.responde(() => this.alimentos.query('SELECT 1')),
      this.responde(() => this.logistica.query('SELECT 1')),
      this.responde(() => this.pagos.query('SELECT 1')),
      this.responde(() => this.redis.ping()),
    ]);
    // Redis es necesario para aceptar reservas. Rabbit se informa como antes.
    const listo = identidad && alimentos && logistica && pagos && redis;
    respuesta.status(listo ? 200 : 503);
    return {
      servicio: 'nucleo', entorno: this.config.entorno,
      estado: listo && this.rabbit.conectado ? 'arriba' : 'degradado',
      dependencias: {
        postgres: { identidad: identidad ? 'arriba' : 'caido', alimentos: alimentos ? 'arriba' : 'caido', logistica: logistica ? 'arriba' : 'caido', pagos: pagos ? 'arriba' : 'caido' },
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
