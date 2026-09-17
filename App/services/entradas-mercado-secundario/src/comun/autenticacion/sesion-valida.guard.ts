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
import { Request } from 'express';
import Redis from 'ioredis';
import { REDIS } from '../../reventa/concurrencia/redis.provider';

/**
 * Prefijo de las sesiones revocadas en Redis.
 *
 * Lo escribe el Servicio de Administración al cerrar una sesión. **Es un
 * contrato**: ver `App/shared/seguridad/token-sesion.md`.
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

/**
 * Qué roles pueden usar un controlador o una ruta (CU-028). El de la ruta
 * sustituye al del controlador.
 */
export const RolesPermitidos = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_PERMITIDOS, roles);

function sinAutenticar(mensaje: string): UnauthorizedException {
  return new UnauthorizedException({ codigo: 'SIN_AUTENTICAR', mensaje });
}

/**
 * Exige un token de sesión válido — RNF-06: *"endpoints de negocio alcanzables
 * sin token válido: 0 %"*.
 *
 * ## Por qué lo comprueba el propio servicio
 *
 * ADR-02 pone la validación en el API Gateway, que todavía no existe. Pero
 * aunque existiera, que el servicio verifique por su cuenta no sobra: si alguien
 * alcanzara el servicio sin pasar por el gateway —una red interna mal
 * configurada—, la antigua cabecera `X-Usuario-Id` le habría dejado hacerse
 * pasar por cualquiera.
 *
 * ## Tres comprobaciones
 *
 * 1. **Firma, emisor y expiración**, con la clave pública. No hace falta
 *    preguntar a nadie.
 * 2. **Que la sesión no esté cerrada**, en Redis (ADR-03). Sin esto, cerrar
 *    sesión en la app no serviría de nada aquí.
 * 3. **Que el rol alcance** para esta ruta.
 *
 * Si Redis no responde, se rechaza (503): no se puede saber si el token fue
 * revocado, y aceptarlo por si acaso sería aceptar un token robado justo
 * cuando no se puede comprobar.
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

  /**
   * Devuelve la sesión si el token es auténtico y está en vigor, o `null`.
   *
   * El algoritmo y el emisor se fijan en el `JwtModule`; aquí se comprueba
   * además la **forma** del contenido. Un token bien firmado con un `sub` que
   * no es un UUID no debería existir, pero si existiera, acabaría en consultas
   * a la base como identificador de usuario.
   */
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
