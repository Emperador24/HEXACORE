import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module';
import {
  AccionPermiso as Accion,
  accionDeMetodo,
  esRolDelSistema,
  ModuloPermiso,
  permiso,
  PREFIJO_PERMISOS_ROL,
  PREFIJO_ROLES_USUARIO,
} from './permisos';

/**
 * Prefijo de las sesiones revocadas en Redis (contrato compartido, ver
 * `App/shared/seguridad/token-sesion.md`). Lo escribe el Servicio de
 * Administración al cerrar una sesión.
 */
export const PREFIJO_REVOCADA = 'sesion-revocada:';

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Lo que este servicio usa del token. */
export interface SesionVerificada {
  usuarioId: string;
  /** Roles **vigentes**: los del token, o los nuevos si cambiaron después de emitirlo (CU-028). */
  roles: string[];
  jti: string;
  /** Permisos de sus roles propios (`modulo:accion`), leídos en esta petición (CU-028B). */
  permisos: string[];
}

export interface PeticionConSesion extends Request {
  sesion?: SesionVerificada;
}

const ROLES_PERMITIDOS = 'roles-permitidos';
const MODULO_PERMISO = 'modulo-permiso';
const ACCION_PERMISO = 'accion-permiso';

/** Qué roles pueden usar un controlador o una ruta (CU-028). */
export const RolesPermitidos = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_PERMITIDOS, roles);

/**
 * A qué módulo de la matriz de CU-028 pertenece un controlador o una ruta.
 * Con él, un rol propio que tenga el permiso entra aunque la ruta no lo nombre.
 */
export const ModuloPermisos = (modulo: ModuloPermiso): MethodDecorator & ClassDecorator =>
  SetMetadata(MODULO_PERMISO, modulo);

/**
 * La acción de la matriz que ejerce una ruta, cuando no es la de su método:
 * publicar o cancelar un evento son POST, pero cambian uno que ya existe.
 */
export const AccionPermiso = (accion: Accion): MethodDecorator => SetMetadata(ACCION_PERMISO, accion);

/** Si la sesión tiene, por un rol propio, el permiso de `modulo` para la acción de esta petición. */
export function tienePermiso(peticion: PeticionConSesion, modulo: ModuloPermiso, accion?: Accion): boolean {
  const pedida = accion ?? accionDeMetodo(peticion.method);
  return peticion.sesion?.permisos.includes(permiso(modulo, pedida)) ?? false;
}

function sinAutenticar(mensaje: string): UnauthorizedException {
  return new UnauthorizedException({ codigo: 'SIN_AUTENTICAR', mensaje });
}

/**
 * Exige un token de sesión válido (RNF-06) y, si la ruta lo pide, un rol o un
 * permiso (CU-028). Es la guarda común de los módulos del Núcleo; antes cada
 * uno tenía una copia idéntica, adaptada 1:1 de
 * `backend/modulos/entradas/compartido/sesion-valida.guard.ts` — ver ese
 * archivo para la justificación completa de por qué se verifica aquí y no solo
 * en el gateway.
 *
 * ## Roles vigentes y permisos (CU-028)
 *
 * En el mismo viaje a Redis que comprueba la revocación lee si los roles de la
 * cuenta cambiaron después de emitirse el token. Si cambiaron, manda lo nuevo:
 * a quien le quitaron un rol se le cierra en la petición siguiente, sin
 * esperar a que caduque el token. Solo si la cuenta tiene roles propios hace
 * un segundo viaje, para leer sus matrices; quien solo tiene roles del sistema
 * no paga nada más.
 */
@Injectable()
export class SesionValida implements CanActivate {
  private readonly log = new Logger(SesionValida.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const peticion = contexto.switchToHttp().getRequest<PeticionConSesion>();
    const [esquema, token] = (peticion.headers.authorization ?? '').split(' ');
    if (esquema !== 'Bearer' || !token) {
      throw sinAutenticar('Necesitas iniciar sesión para hacer esto');
    }

    const verificada = await this.verificar(token);
    if (!verificada) {
      throw sinAutenticar('Tu sesión no es válida o ya caducó. Inicia sesión de nuevo.');
    }

    const sesion = await this.vigente(verificada);

    const objetivos = [contexto.getHandler(), contexto.getClass()];
    const permitidos = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_PERMITIDOS, objetivos);
    if (permitidos && !sesion.roles.some((rol) => permitidos.includes(rol))) {
      const modulo = this.reflector.getAllAndOverride<ModuloPermiso | undefined>(MODULO_PERMISO, objetivos);
      const accion =
        this.reflector.get<Accion | undefined>(ACCION_PERMISO, contexto.getHandler()) ??
        accionDeMetodo(peticion.method);
      if (!modulo || !sesion.permisos.includes(permiso(modulo, accion))) {
        throw new ForbiddenException({
          codigo: 'ROL_INSUFICIENTE',
          mensaje: modulo
            ? `Esta operación es solo para: ${permitidos.join(', ')}, o para un rol con permiso de ${accion} en ${modulo}`
            : `Esta operación es solo para: ${permitidos.join(', ')}`,
        });
      }
    }

    peticion.sesion = sesion;
    return true;
  }

  private async vigente(token: Omit<SesionVerificada, 'permisos'>): Promise<SesionVerificada> {
    try {
      const [[errorRevocada, revocada], [errorRoles, rolesNuevos]] = (await this.redis
        .multi()
        .exists(`${PREFIJO_REVOCADA}${token.jti}`)
        .get(`${PREFIJO_ROLES_USUARIO}${token.usuarioId}`)
        .exec()) as [[Error | null, number], [Error | null, string | null]];
      if (errorRevocada || errorRoles) throw errorRevocada ?? errorRoles;
      if (revocada) {
        throw sinAutenticar('Tu sesión se cerró. Inicia sesión de nuevo.');
      }

      const roles = rolesNuevos ? this.leerRoles(rolesNuevos) ?? token.roles : token.roles;
      const propios = roles.filter((rol) => !esRolDelSistema(rol));
      let permisos: string[] = [];
      if (propios.length > 0) {
        const lote = this.redis.multi();
        for (const rol of propios) lote.smembers(`${PREFIJO_PERMISOS_ROL}${rol}`);
        const resultados = (await lote.exec()) as [Error | null, string[]][];
        const fallo = resultados.find(([error]) => error);
        if (fallo) throw fallo[0];
        permisos = [...new Set(resultados.flatMap(([, miembros]) => miembros))];
      }
      return { ...token, roles, permisos };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.log.error(`No se pudo comprobar la sesión en Redis: ${(error as Error).message}`);
      throw new ServiceUnavailableException({
        codigo: 'SESIONES_NO_DISPONIBLES',
        mensaje: 'No podemos comprobar tu sesión en este momento. Inténtalo de nuevo en unos segundos.',
      });
    }
  }

  /** Una clave mal formada no debe dar ni quitar acceso: se ignora y valen los del token. */
  private leerRoles(valor: string): string[] | null {
    try {
      const roles: unknown = JSON.parse(valor);
      if (Array.isArray(roles) && roles.every((r) => typeof r === 'string')) return roles;
    } catch {
      /* se registra abajo */
    }
    this.log.warn('Roles vigentes con formato inválido en Redis; se usan los del token');
    return null;
  }

  private async verificar(token: string): Promise<Omit<SesionVerificada, 'permisos'> | null> {
    let contenido: Record<string, unknown>;
    try {
      contenido = await this.jwt.verifyAsync<Record<string, unknown>>(token);
    } catch {
      return null;
    }
    const { sub, roles, jti } = contenido;
    if (
      typeof sub !== 'string' ||
      !ES_UUID.test(sub) ||
      typeof jti !== 'string' ||
      !Array.isArray(roles) ||
      !roles.every((r) => typeof r === 'string')
    ) {
      return null;
    }
    return { usuarioId: sub, roles: roles as string[], jti };
  }
}
