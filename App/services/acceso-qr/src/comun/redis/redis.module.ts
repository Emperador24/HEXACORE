import { Global, Inject, Logger, Module, OnModuleDestroy, Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { CONFIGURACION, ConfiguracionServicio } from '../../config/configuracion';

/** Cliente de Redis compartido por todos los módulos del Núcleo. */
export const REDIS = 'CLIENTE_REDIS';

/**
 * Cliente de Redis (ADR-03). Configurado para **fallar rápido**.
 *
 * Antes de ADR-12 cada servicio traía su propia copia de este proveedor, con
 * las mismas opciones y el mismo manejador de errores. En un solo proceso no
 * tiene sentido abrir dos conexiones idénticas al mismo Redis: aquí hay una,
 * y los dos módulos la comparten.
 */
export const proveedorRedis: Provider = {
  provide: REDIS,
  inject: [CONFIGURACION],
  useFactory: (config: ConfiguracionServicio): Redis => {
    const log = new Logger('Redis');
    const destino = `${config.redis.host}:${config.redis.puerto}`;
    const cliente = new Redis({
      host: config.redis.host,
      port: config.redis.puerto,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      // Sin esto, un Redis colgado (conexión abierta, sin respuesta) dejaría el
      // cierre de sesión esperando para siempre en vez de fallar en claro.
      commandTimeout: 2000,
    });

    // Sin este manejador, un error de conexión en ioredis se convierte en una
    // excepción no capturada que tumba el proceso entero.
    //
    // Se registran `code` y destino además del mensaje porque los errores de
    // conexión de ioredis llegan con `message` vacío: un log que dice solo
    // "Error de Redis:" no ayuda a nadie a las dos de la mañana.
    let ultimoAviso = '';
    cliente.on('connect', () => log.log(`Conectado a ${destino}`));
    cliente.on('ready', () => (ultimoAviso = ''));
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

    return cliente;
  },
};

/**
 * Infraestructura del proceso, igual que la configuración: `@Global` para que
 * cualquier módulo pueda inyectar `REDIS` sin que cada uno tenga que importar
 * este módulo. No es una dependencia de dominio, es una del Núcleo.
 */
@Global()
@Module({
  providers: [proveedorRedis],
  exports: [REDIS],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Cierra el cliente al apagar, para que SIGTERM termine limpio (RNF-15). */
  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
