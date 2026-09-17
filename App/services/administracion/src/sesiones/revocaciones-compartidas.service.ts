import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Provider,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';

export const REDIS = 'CLIENTE_REDIS';

/**
 * Prefijo de las claves de sesión revocada.
 *
 * **Es un contrato con los demás microservicios**, que leen estas claves: ver
 * `App/shared/seguridad/token-sesion.md`. Cambiarlo aquí sin cambiarlo allí
 * haría que un token revocado siguiera valiendo en el resto del sistema.
 */
export const PREFIJO_REVOCADA = 'sesion-revocada:';

/**
 * Margen añadido a la vida de la clave en Redis.
 *
 * La clave tiene que sobrevivir al token. Si se borrara justo al expirar, un
 * servicio con el reloj un poco atrasado aceptaría el token durante esos
 * segundos: ya no estaría en la lista de revocados y, para él, aún no habría
 * caducado.
 */
const MARGEN_RELOJ_MS = 60_000;

/** Una sesión que se acaba de cerrar y hay que anunciar. */
export interface SesionRevocada {
  jti: string;
  expiraEn: Date;
}

/** Cliente de Redis. Mismas opciones que en el servicio de Entradas: fallar rápido. */
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
    let ultimoAviso = '';
    cliente.on('connect', () => log.log(`Conectado a ${destino}`));
    cliente.on('ready', () => (ultimoAviso = ''));
    // Sin manejador, un error de conexión de ioredis tumba el proceso.
    cliente.on('error', (error: Error & { code?: string }) => {
      const aviso = `No se pudo hablar con Redis (${destino}): ${error.code ?? error.message}`;
      if (aviso !== ultimoAviso) log.error(aviso);
      ultimoAviso = aviso;
    });
    return cliente;
  },
};

/**
 * Anuncia al resto del sistema qué sesiones se han cerrado (ADR-03).
 *
 * ## El problema que resuelve
 *
 * Los demás microservicios validan el token con la clave pública, sin
 * preguntar a este servicio: es lo que los hace independientes de él. Pero así
 * no se enterarían de que alguien cerró sesión, y un token robado seguiría
 * sirviendo en la reventa hasta que caducara.
 *
 * La lista de revocados vive en Redis, que ADR-03 ya prevé para "sesiones" y
 * que los servicios ya consultan para sus bloqueos. Cada clave dura lo que le
 * queda al token (más un margen): pasado ese tiempo el token caduca solo y la
 * clave no hace falta, así que la lista no crece sin límite.
 *
 * ## Si Redis no está, cerrar sesión falla
 *
 * Se anuncia **dentro** de la transacción que marca la sesión como revocada, y
 * si Redis no responde, se lanza y la transacción se deshace. La alternativa
 * —cerrar la sesión aquí y no anunciarlo— le diría a la persona "sesión
 * cerrada" mientras su token sigue valiendo en el resto del sistema. Mejor un
 * error honesto que una falsa sensación de seguridad.
 */
@Injectable()
export class RevocacionesCompartidas implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(RevocacionesCompartidas.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @InjectDataSource() private readonly fuenteDatos: DataSource,
  ) {}

  async anunciar(sesiones: SesionRevocada[]): Promise<void> {
    // Una fecha inválida haría que el filtro de abajo descartara la sesión sin
    // decir nada, y el token seguiría valiendo en el resto del sistema. Mejor
    // fallar a la vista.
    const rota = sesiones.find((s) => typeof s.jti !== 'string' || Number.isNaN(s.expiraEn.getTime()));
    if (rota) {
      throw new Error(`Sesión revocada con datos incompletos: ${JSON.stringify(rota)}`);
    }
    const ahora = Date.now();
    // Las ya caducadas no hace falta anunciarlas: ningún servicio las acepta.
    const vigentes = sesiones.filter((s) => s.expiraEn.getTime() > ahora);
    if (vigentes.length === 0) return;

    const lote = this.redis.multi();
    for (const s of vigentes) {
      lote.set(`${PREFIJO_REVOCADA}${s.jti}`, '1', 'PX', s.expiraEn.getTime() - ahora + MARGEN_RELOJ_MS);
    }
    try {
      const resultados = await lote.exec();
      const fallo = resultados?.find(([error]) => error);
      if (!resultados || fallo) throw fallo?.[0] ?? new Error('Redis descartó el lote');
    } catch (error) {
      this.log.error(`No se pudieron anunciar ${vigentes.length} sesiones revocadas: ${(error as Error).message}`);
      throw new ServiceUnavailableException({
        codigo: 'REVOCACION_NO_DISPONIBLE',
        mensaje: 'No se pudo cerrar la sesión en todo el sistema. Inténtalo de nuevo en unos segundos.',
      });
    }
  }

  /**
   * Al arrancar, vuelve a anunciar todas las revocaciones vigentes.
   *
   * Cubre dos casos: sesiones cerradas antes de que existiera este mecanismo, y
   * un Redis que se reinició y perdió sus datos. La base es la fuente de
   * verdad; Redis es una copia que se puede reconstruir.
   *
   * Si Redis no está al arrancar, se avisa y se sigue: el login debe funcionar
   * igual, y cerrar sesión fallará en claro hasta que vuelva.
   */
  async onApplicationBootstrap(): Promise<void> {
    const filas: { jti: string; expira_en: Date }[] = await this.fuenteDatos.query(
      `SELECT jti, expira_en FROM sesiones WHERE revocada_en IS NOT NULL AND expira_en > now()`,
    );
    try {
      await this.anunciar(filas.map((f) => ({ jti: f.jti, expiraEn: new Date(f.expira_en) })));
      this.log.log(`Revocaciones vigentes publicadas en Redis: ${filas.length}`);
    } catch {
      this.log.error('Redis no disponible al arrancar: las revocaciones se publicarán cuando se cierre otra sesión');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
