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
import { REDIS } from './redis.provider.js';

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
  roles: string[];
  jti: string;
}

export interface PeticionConSesion extends Request {
  sesion?: SesionVerificada;
}

const ROLES_PERMITIDOS = 'roles-permitidos';

/** Qué roles pueden usar un controlador o una ruta (CU-028). */
export const RolesPermitidos = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_PERMITIDOS, roles);

function sinAutenticar(mensaje: string): UnauthorizedException {
  return new UnauthorizedException({ codigo: 'SIN_AUTENTICAR', mensaje });
}

/**
 * Exige un token de sesión válido (RNF-06). Adaptado 1:1 del contrato y la
 * implementación de referencia en
 * `services/entradas-mercado-secundario/src/comun/autenticacion/sesion-valida.guard.ts`
 * — ver ese archivo para la justificación completa de por qué se verifica
 * aquí y no solo en el gateway.
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

    const sesion = await this.verificar(token);
    if (!sesion) {
      throw sinAutenticar('Tu sesión no es válida o ya caducó. Inicia sesión de nuevo.');
    }

    let revocada: number;
    try {
      revocada = await this.redis.exists(`${PREFIJO_REVOCADA}${sesion.jti}`);
    } catch (error) {
      this.log.error(`No se pudo comprobar la revocación en Redis: ${(error as Error).message}`);
      throw new ServiceUnavailableException({
        codigo: 'SESIONES_NO_DISPONIBLES',
        mensaje: 'No podemos comprobar tu sesión en este momento. Inténtalo de nuevo en unos segundos.',
      });
    }
    if (revocada) {
      throw sinAutenticar('Tu sesión se cerró. Inicia sesión de nuevo.');
    }

    const permitidos = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_PERMITIDOS, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (permitidos && !sesion.roles.some((rol) => permitidos.includes(rol))) {
      throw new ForbiddenException({
        codigo: 'ROL_INSUFICIENTE',
        mensaje: `Esta operación es solo para: ${permitidos.join(', ')}`,
      });
    }

    peticion.sesion = sesion;
    return true;
  }

  private async verificar(token: string): Promise<SesionVerificada | null> {
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
