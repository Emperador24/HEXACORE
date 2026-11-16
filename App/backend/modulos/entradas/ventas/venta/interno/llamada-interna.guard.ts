import { CanActivate, ExecutionContext, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { CONFIGURACION, ConfiguracionServicio } from '../../config/configuracion';

/** Cabecera con la que un servicio se identifica ante la API interna. */
export const CABECERA_SERVICIO = 'x-token-servicio';

/** API interna de servicio: una sesión de usuario no acredita a Postventa.
 * Los controladores públicos autorizan al actor y los adaptadores se autentican
 * aquí con TOKEN_SERVICIOS. No confiar en el propietario que declara un Cliente.
 */
@Injectable()
export class LlamadaInterna implements CanActivate {
  private readonly log = new Logger(LlamadaInterna.name);
  private readonly secreto: Buffer;

  constructor(
    @Inject(CONFIGURACION) config: ConfiguracionServicio,
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
      this.log.warn('Credencial de servicio inválida en la API interna de Ventas');
    }

    throw new UnauthorizedException({ codigo: 'SERVICIO_NO_AUTENTICADO' });
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
