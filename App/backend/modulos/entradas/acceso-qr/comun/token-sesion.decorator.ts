import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

/**
 * El token de sesión tal como llegó, para **reenviarlo** a otro servicio.
 *
 * Existe porque Pagos autentica sus llamadas como cualquier otra ruta: no está
 * expuesto por el gateway, pero que algo sea alcanzable solo desde dentro de la
 * red no es un control de acceso (RNF-06). Así la operación queda a nombre del
 * usuario que la pidió, que es lo que el libro de idempotencia audita.
 *
 * Se devuelve el token y no la sesión ya verificada a propósito: el servicio
 * de destino tiene que volver a verificarlo por su cuenta, incluida la
 * revocación. Confiar en que el anterior ya lo hizo es exactamente lo que
 * ADR-11 evita.
 */
export const TokenSesion = createParamDecorator((_datos: unknown, contexto: ExecutionContext): string => {
  const cabecera = contexto.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>()
    .headers.authorization;
  const [esquema, token] = (cabecera ?? '').split(' ');
  if (esquema?.toLowerCase() !== 'bearer' || !token) {
    throw new UnauthorizedException({ codigo: 'SIN_AUTENTICAR', mensaje: 'Necesitas iniciar sesión para hacer esto' });
  }
  return token;
});
