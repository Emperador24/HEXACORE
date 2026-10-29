import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { CONFIGURACION, ConfiguracionServicio } from '../../config/configuracion';
import { SesionValida } from '../../comun/autenticacion/sesion-valida.guard';

/** Cabecera con la que un servicio se identifica ante la API interna. */
export const CABECERA_SERVICIO = 'x-token-servicio';

/**
 * Autoriza una llamada a la API interna de Ventas.
 *
 * ## Por qué hace falta algo distinto de `SesionValida`
 *
 * `/interno/` no se enruta en el gateway (`nginx.conf`): solo existe dentro de
 * la red de Docker, y quien llama es siempre otro servicio. Hasta ahora esos
 * servicios reenviaban el token del usuario que había disparado la acción —el
 * operario de la puerta en Acceso QR, el comprador en Postventa— y eso
 * funcionaba porque siempre había alguien.
 *
 * El trabajo de expiración de Postventa (CU-006D) rompió esa suposición. Corre
 * por reloj, cierra las publicaciones vencidas y tiene que pedirle a Ventas que
 * libere cada entrada. No hay usuario: no hay token que reenviar.
 *
 * ## Por qué un credencial de servicio y no un usuario de sistema
 *
 * Inventar una cuenta "sistema" con su token de sesión sería disfrazar un
 * servicio de persona: aparecería en la auditoría como si alguien hubiera hecho
 * algo, y heredaría el ciclo de vida de las sesiones —caducidad, revocación—
 * que no tiene sentido para un proceso.
 *
 * De hecho el credencial de servicio es el modelo **más** correcto también para
 * las llamadas que hoy reenvían el token del usuario: la autoridad real de
 * "gasta este QR" no es el operario, es que Acceso QR tenga permiso de pedirlo.
 * Se aceptan las dos formas para no romper a quien ya funciona, y porque un
 * token de usuario válido no es menos seguro, solo menos preciso.
 */
@Injectable()
export class LlamadaInterna implements CanActivate {
  private readonly log = new Logger(LlamadaInterna.name);
  private readonly secreto: Buffer;

  constructor(
    @Inject(CONFIGURACION) config: ConfiguracionServicio,
    private readonly sesion: SesionValida,
  ) {
    this.secreto = Buffer.from(config.tokenServicios, 'utf8');
  }

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const peticion = contexto.switchToHttp().getRequest<Request>();
    const presentado = peticion.headers[CABECERA_SERVICIO];

    if (typeof presentado === 'string' && presentado !== '') {
      if (this.coincide(presentado)) return true;
      // Un secreto presentado y equivocado se registra: significa que algo
      // dentro de la red interna está mal configurado, o que no debería estar.
      this.log.warn(`Token de servicio inválido en ${peticion.method} ${peticion.url}`);
    }

    // Sin credencial de servicio, se exige una sesión de usuario como antes.
    return this.sesion.canActivate(contexto);
  }

  /**
   * Comparación en tiempo constante.
   *
   * Un `===` sobre secretos filtra por el tiempo de respuesta cuántos bytes
   * iniciales acertó quien prueba. `timingSafeEqual` exige longitudes iguales,
   * así que la diferencia de longitud se descarta antes y por separado.
   */
  private coincide(presentado: string): boolean {
    const recibido = Buffer.from(presentado, 'utf8');
    if (recibido.length !== this.secreto.length) return false;
    return timingSafeEqual(recibido, this.secreto);
  }
}
