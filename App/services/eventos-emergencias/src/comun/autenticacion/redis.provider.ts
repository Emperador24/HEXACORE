import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

export const REDIS = 'CLIENTE_REDIS';

/**
 * Cliente de Redis, usado solo para comprobar sesiones revocadas
 * (`sesion-revocada:<jti>`, ver `App/shared/seguridad/token-sesion.md`).
 * Mismos parámetros que el proveedor de referencia en
 * `entradas-mercado-secundario/src/reventa/concurrencia/redis.provider.ts`:
 * hay que fallar rápido y en claro si Redis no responde, no encolar y
 * esperar — el guard debe devolver 503, no colgarse.
 */
export const proveedorRedis: Provider = {
  provide: REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis => {
    const log = new Logger('Redis');
    const host = config.get<string>('REDIS_HOST', 'localhost');
    const puerto = config.get<number>('REDIS_PUERTO', 6380);
    const cliente = new Redis({
      host,
      port: puerto,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
      commandTimeout: 2000,
    });

    const destino = `${host}:${puerto}`;
    cliente.on('connect', () => log.log(`Conectado a ${destino}`));

    let ultimoAviso = '';
    cliente.on('error', (error: Error & { code?: string }) => {
      const detalle = error.code ?? error.message ?? error.name ?? 'desconocido';
      const aviso = `No se pudo hablar con Redis (${destino}): ${detalle}`;
      if (aviso !== ultimoAviso) {
        log.error(aviso);
        ultimoAviso = aviso;
      }
    });
    cliente.on('ready', () => {
      ultimoAviso = '';
    });

    return cliente;
  },
};
