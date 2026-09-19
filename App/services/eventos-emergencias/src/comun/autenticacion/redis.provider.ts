import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

/**
 * Conexión a Redis, que aquí sirve para una sola cosa: saber si una sesión fue
 * cerrada (ADR-03, ADR-11). Es el mismo Redis que usa el resto del sistema.
 */

export const REDIS = Symbol('REDIS');

export const proveedorRedis: Provider = {
  provide: REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const log = new Logger('Redis');
    const cliente = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: Number(config.get('REDIS_PUERTO', 6380)),
      // Sin este tiempo límite, una orden contra un Redis que acepta la
      // conexión pero no responde se queda esperando para siempre, y con ella
      // la petición del usuario.
      commandTimeout: 2000,
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });
    cliente.on('error', (error) => log.warn(`Redis: ${error.message}`));
    return cliente;
  },
};
