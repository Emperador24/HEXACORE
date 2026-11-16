import { CONEXION_IDENTIDAD } from '../persistencia/conexion';
import { Inject, Injectable, Logger, OnApplicationBootstrap, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { REDIS } from '../../../compartido/redis/redis.module';
import { PREFIJO_PERMISOS_ROL, PREFIJO_ROLES_USUARIO } from '../../../compartido/seguridad/permisos';
import { CONFIGURACION, ConfiguracionServicio } from '../comun/config/configuracion';

/** Margen sobre la vida del token, por relojes que no van a la par (como en las revocaciones). */
const MARGEN_RELOJ_MS = 60_000;

/**
 * Publica en Redis lo que las guardas necesitan para aplicar CU-028 sin
 * preguntar a Identidad: la matriz de cada rol propio y los roles vigentes de
 * quien acaba de cambiar. Contrato en `compartido/seguridad/permisos.ts`.
 *
 * Igual que `RevocacionesCompartidas`, se llama **dentro** de la transacción
 * del cambio y, si Redis no responde, lanza y la deshace: restringir un permiso
 * que luego no se aplica le diría al administrador "hecho" cuando no lo está.
 */
@Injectable()
export class PermisosCompartidos implements OnApplicationBootstrap {
  private readonly log = new Logger(PermisosCompartidos.name);
  private readonly vidaRolesMs: number;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @InjectDataSource(CONEXION_IDENTIDAD) private readonly fuenteDatos: DataSource,
    @Inject(CONFIGURACION) config: ConfiguracionServicio,
  ) {
    this.vidaRolesMs = config.seguridad.sesionMinutos * 60_000 + MARGEN_RELOJ_MS;
  }

  /** Deja la matriz de `rol` como `permisos`; sin permisos, la borra. */
  async publicarMatriz(rol: string, permisos: string[]): Promise<void> {
    const lote = this.redis.multi().del(`${PREFIJO_PERMISOS_ROL}${rol}`);
    if (permisos.length > 0) lote.sadd(`${PREFIJO_PERMISOS_ROL}${rol}`, ...permisos);
    await this.ejecutar(lote, `la matriz de ${rol}`);
  }

  /**
   * Anuncia los roles que tienen ahora estas cuentas. La clave dura lo que un
   * token emitido antes del cambio; después, el token ya los trae.
   */
  async publicarRoles(cuentas: { usuarioId: string; roles: string[] }[]): Promise<void> {
    if (cuentas.length === 0) return;
    const lote = this.redis.multi();
    for (const c of cuentas) {
      lote.set(`${PREFIJO_ROLES_USUARIO}${c.usuarioId}`, JSON.stringify(c.roles), 'PX', this.vidaRolesMs);
    }
    await this.ejecutar(lote, `los roles de ${cuentas.length} cuentas`);
  }

  private async ejecutar(lote: ReturnType<Redis['multi']>, que: string): Promise<void> {
    try {
      const resultados = await lote.exec();
      const fallo = resultados?.find(([error]) => error);
      if (!resultados || fallo) throw fallo?.[0] ?? new Error('Redis descartó el lote');
    } catch (error) {
      this.log.error(`No se pudo publicar ${que}: ${(error as Error).message}`);
      throw new ServiceUnavailableException({
        codigo: 'PERMISOS_NO_DISPONIBLES',
        mensaje: 'No se pudo aplicar el cambio en todo el sistema. Inténtalo de nuevo en unos segundos.',
      });
    }
  }

  /**
   * Al arrancar, rehace todas las matrices desde la base y borra las de roles
   * que ya no existen. Cubre un Redis que se reinició o una matriz que quedó a
   * medias. Si Redis no está, se avisa y se sigue: el resto del Núcleo debe
   * arrancar, y los cambios de roles fallarán en claro hasta que vuelva.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const filas = (await this.fuenteDatos.query(
        `SELECT r.nombre, coalesce(array_agg(p.modulo || ':' || p.accion) FILTER (WHERE p.modulo IS NOT NULL), '{}') AS permisos
           FROM roles r LEFT JOIN permisos_roles p ON p.rol_id = r.id
          WHERE NOT r.del_sistema
          GROUP BY r.nombre`,
      )) as { nombre: string; permisos: string[] }[];
      const vigentes = new Set(filas.map((f) => `${PREFIJO_PERMISOS_ROL}${f.nombre}`));
      const sobrantes: string[] = [];
      let cursor = '0';
      do {
        const [siguiente, claves] = await this.redis.scan(cursor, 'MATCH', `${PREFIJO_PERMISOS_ROL}*`, 'COUNT', 200);
        cursor = siguiente;
        sobrantes.push(...claves.filter((c) => !vigentes.has(c)));
      } while (cursor !== '0');

      const lote = this.redis.multi();
      for (const clave of sobrantes) lote.del(clave);
      for (const f of filas) {
        lote.del(`${PREFIJO_PERMISOS_ROL}${f.nombre}`);
        if (f.permisos.length > 0) lote.sadd(`${PREFIJO_PERMISOS_ROL}${f.nombre}`, ...f.permisos);
      }
      await lote.exec();
      this.log.log(`Matrices de permisos publicadas: ${filas.length} roles propios`);
    } catch (error) {
      this.log.warn(`No se pudieron publicar las matrices de permisos al arrancar: ${(error as Error).message}`);
    }
  }
}
