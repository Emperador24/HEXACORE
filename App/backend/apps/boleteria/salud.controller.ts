import { Controller, Get, Inject, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { SchedulerRegistry } from '@nestjs/schedule';
import { REDIS } from '../../compartido/redis/redis.module';
import { ConexionRabbitMq } from '../../compartido/rabbitmq/conexion-rabbitmq.service';
@Controller('salud')
export class SaludBoleteriaController {
  constructor(
    @InjectDataSource('entradas-ventas') private ventas: DataSource,
    @InjectDataSource('entradas-catalogo') private catalogo: DataSource,
    @InjectDataSource('entradas-postventa') private postventa: DataSource,
    @InjectDataSource('entradas-acceso-qr') private acceso: DataSource,
    @InjectDataSource('finanzas-pagos') private pagos: DataSource,
    @Inject(REDIS) private redis: Redis,
    private rabbit: ConexionRabbitMq,
    private scheduler: SchedulerRegistry,
  ) {}
  @Get() async estado(@Res({ passthrough: true }) res: Response) {
    const probar = async (f: () => Promise<unknown>) => {
      let timer: NodeJS.Timeout | undefined;
      try {
        return await Promise.race([
          f().then(
            () => true,
            () => false,
          ),
          new Promise<boolean>((r) => {
            timer = setTimeout(() => r(false), 1000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    };
    const valores = await Promise.all(
      [this.ventas, this.catalogo, this.postventa, this.acceso, this.pagos].map((d) =>
        probar(() => d.query('SELECT 1')),
      ),
    );
    const redis = await probar(() => this.redis.ping()),
      listo = valores.every(Boolean) && redis;
    res.status(listo ? 200 : 503);
    return {
      servicio: 'boleteria',
      estado: listo && this.rabbit.conectado ? 'arriba' : 'degradado',
      pid: process.pid,
      trabajos: { cron: [...this.scheduler.getCronJobs().keys()].sort() },
      dependencias: {
        postgres: Object.fromEntries(
          ['ventas', 'catalogo', 'postventa', 'acceso-qr', 'pagos'].map((n, i) => [
            n,
            valores[i] ? 'arriba' : 'caido',
          ]),
        ),
        redis: redis ? 'arriba' : 'caido',
        rabbitmq: this.rabbit.conectado ? 'arriba' : 'caido',
      },
    };
  }
}
