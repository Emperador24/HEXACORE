import { Logger, Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';

export const REDIS_INVENTARIO = 'CLIENTE_REDIS_INVENTARIO';

/** Conexión independiente de autenticación; un timeout no prueba que Lua no se ejecutó. */
export const proveedorRedisInventario: Provider = {
  provide: REDIS_INVENTARIO,
  inject: [CONFIGURACION],
  useFactory: (config: ConfiguracionServicio): Redis => {
    const log = new Logger('RedisInventario');
    const cliente = new Redis({
      host: config.redis.host,
      port: config.redis.puerto,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      autoResendUnfulfilledCommands: false,
      lazyConnect: false,
      connectTimeout: 2000,
      commandTimeout: 2000,
    });
    const destino = `${config.redis.host}:${config.redis.puerto}`;
    let ultimoAviso = '';
    cliente.on('connect', () => log.log(`Conectado a ${destino}`));
    cliente.on('error', (error: Error & { code?: string }) => {
      const aviso = `Redis de inventario no disponible (${error.code ?? error.name}) en ${destino}`;
      if (aviso !== ultimoAviso) { log.error(aviso); ultimoAviso = aviso; }
    });
    cliente.on('ready', () => { ultimoAviso = ''; });
    return cliente;
  },
};
