import { Logger, Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { CONFIGURACION, ConfiguracionServicio } from '../../config/configuracion';

export const REDIS = 'CLIENTE_REDIS';

/**
 * Cliente de Redis (ADR-03).
 *
 * `maxRetriesPerRequest: 1` en vez del valor por defecto (20): si Redis no
 * está, esta petición debe fallar rápido y en claro. Reintentar veinte veces
 * dejaría al comprador mirando una pantalla congelada durante segundos antes
 * de decirle lo mismo, y con el TTL del bloqueo corriendo en paralelo.
 *
 * `enableOfflineQueue: false` por el mismo motivo: encolar comandos mientras
 * el cliente está desconectado haría que un `SET NX` se ejecutara tarde, cuando
 * quien lo pidió ya se rindió — y dejaría una publicación bloqueada por un
 * checkout que ya no existe.
 */
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
      // Límite por comando. Las dos opciones de arriba solo actúan cuando la
      // conexión se cae; un Redis colgado —la conexión abierta pero sin
      // responder— dejaba cada petición esperando indefinidamente. Se descubrió
      // al pausar el contenedor en la prueba de RNF-06: más de 30 s sin
      // respuesta en lugar de un 503. Dos segundos sobran para un SET o un
      // EXISTS, que tardan menos de un milisegundo.
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
