import { CanActivate, createParamDecorator, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { SinAutenticar } from '../cuentas/cuentas.errors';
import { ContenidoToken, SesionesService } from './sesiones.service';

/** La petición, con la sesión ya validada colgada de ella. */
export interface PeticionAutenticada extends Request {
  sesion: ContenidoToken;
}

/**
 * Exige un token de sesión válido y no revocado (RNF-06).
 *
 * Lee `Authorization: Bearer <token>` y nada más: ni cookies ni parámetros de
 * la URL. Un token en la URL acaba en los logs del servidor, en el historial
 * del navegador y en la cabecera `Referer` de cualquier enlace que se pulse.
 */
@Injectable()
export class SesionRequerida implements CanActivate {
  constructor(private readonly sesiones: SesionesService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const peticion = contexto.switchToHttp().getRequest<PeticionAutenticada>();
    const [esquema, token] = (peticion.headers.authorization ?? '').split(' ');

    if (esquema !== 'Bearer' || !token) throw new SinAutenticar();

    const contenido = await this.sesiones.validar(token);
    // Un único mensaje para token caducado, falsificado o revocado: al cliente
    // le basta con saber que tiene que volver a entrar.
    if (!contenido) throw new SinAutenticar('Tu sesión no es válida o ya caducó. Inicia sesión de nuevo.');

    peticion.sesion = contenido;
    return true;
  }
}

/** Inyecta en el controlador la sesión que validó `SesionRequerida`. */
export const SesionActual = createParamDecorator(
  (_: unknown, contexto: ExecutionContext): ContenidoToken =>
    contexto.switchToHttp().getRequest<PeticionAutenticada>().sesion,
);
