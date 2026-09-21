import { Logger, Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { CONFIGURACION, ConfiguracionServicio } from '../../config/configuracion';

export const REDIS = 'CLIENTE_REDIS';

/** Redis para consultar revocaciones: sin cola offline y con espera acotada. */
export const proveedorRedis: Provider = {
  provide: REDIS,
  inject: [CONFIGURACION],
  useFactory: (config: ConfiguracionServicio): Redis => {
    const log = new Logger('Redis');
    const cliente = new Redis({
      host: config.redis.host,
      port: config.redis.puerto,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
      commandTimeout: 2000,
    });

    const destino = `${config.redis.host}:${config.redis.puerto}`;
    cliente.on('connect', () => log.log(`Conectado a ${destino}`));

    // Sin este manejador, un error de conexión en ioredis se convierte en una
    // excepción no capturada que tumba el proceso entero.
    //
    // Se registran `code` y destino además del mensaje porque los errores de
    // conexión de ioredis llegan con `message` vacío: un log que dice solo
    // "Error de Redis:" no ayuda a nadie a las dos de la mañana. Con esto se
    // lee "ECONNREFUSED contra localhost:6380" y el diagnóstico es inmediato.
    let ultimoAviso = '';
    cliente.on('error', (error: Error & { code?: string }) => {
      const detalle = error.code ?? error.message ?? error.name ?? 'desconocido';
      const aviso = `No se pudo hablar con Redis (${destino}): ${detalle}`;
      // ioredis reintenta en bucle; sin esto, una caída llena el log con miles
      // de líneas idénticas y esconde cualquier otra cosa que esté pasando.
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
