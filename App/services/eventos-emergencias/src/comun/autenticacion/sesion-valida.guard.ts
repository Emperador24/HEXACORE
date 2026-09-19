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
 * Autenticación de este servicio (RNF-06).
 *
 * Verifica el token con la clave **pública** (ADR-11) y comprueba en Redis que
 * la sesión no se haya cerrado. Las dos cosas, y hacen falta las dos: la firma
 * dice que el token es auténtico, Redis dice que todavía vale.
 *
 * **Por qué se valida aquí, si el API Gateway ya validó.** Porque el gateway no
 * es una frontera infranqueable: cualquiera dentro de la red puede llamar al
 * puerto de este servicio y poner la cabecera `X-Usuario-Id` que quiera. Esa
 * cabecera es una comodidad para trazas, nunca una credencial.
 */

export const PREFIJO_REVOCADA = 'sesion-revocada:';

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SesionVerificada {
  usuarioId: string;
  roles: string[];
  jti: string;
}

export interface PeticionConSesion extends Request {
  sesion?: SesionVerificada;
}

const ROLES_PERMITIDOS = 'roles-permitidos';

/** Restringe un endpoint a ciertos roles (CU-028). */
export const RolesPermitidos = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_PERMITIDOS, roles);

function sinAutenticar(mensaje: string): UnauthorizedException {
  return new UnauthorizedException({ codigo: 'SIN_AUTENTICAR', mensaje });
}

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
      // Sin Redis no se puede saber si la sesión sigue abierta. Dejar pasar
      // sería aceptar tokens de sesiones cerradas; se prefiere decirlo.
      this.log.error(`No se pudo comprobar la revocación en Redis: ${(error as Error).message}`);
      throw new ServiceUnavailableException({
        codigo: 'SESIONES_NO_DISPONIBLES',
        mensaje:
          'No podemos comprobar tu sesión en este momento. Inténtalo de nuevo en unos segundos.',
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
      // El algoritmo lo fija la configuración del JwtModule, no el token: si se
      // aceptara el que declara el propio token, uno con `alg: none` —o uno
      // "firmado" con la clave pública como secreto HMAC— pasaría.
      contenido = await this.jwt.verifyAsync<Record<string, unknown>>(token);
    } catch {
      return null;
    }

    const usuarioId = contenido.sub;
    const jti = contenido.jti;
    const roles = contenido.roles;

    if (typeof usuarioId !== 'string' || !ES_UUID.test(usuarioId)) return null;
    if (typeof jti !== 'string' || !ES_UUID.test(jti)) return null;
    if (!Array.isArray(roles) || !roles.every((r) => typeof r === 'string')) return null;

    return { usuarioId, roles: roles as string[], jti };
  }
}
