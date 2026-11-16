import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { PeticionConSesion } from './autenticacion/sesion-valida.guard';

/**
 * Identidad del usuario que hace la petición: el `sub` del token de sesión que
 * verificó `SesionValida` (RNF-06).
 *
 * Sustituye a la antigua cabecera `X-Usuario-Id`, que cualquiera podía
 * rellenar con el identificador de otra persona. Los controladores y el dominio
 * no han cambiado: siguen recibiendo un `usuarioId`, solo que ahora está
 * firmado por el Servicio de Administración.
 *
 * Que ese usuario sea el dueño de la entrada que intenta publicar lo sigue
 * comprobando el Servicio de Publicación contra la base: el token dice quién
 * es, no qué le pertenece.
 */
export const UsuarioActual = createParamDecorator((_datos: unknown, contexto: ExecutionContext): string => {
  const sesion = contexto.switchToHttp().getRequest<PeticionConSesion>().sesion;
  // Solo pasa si una ruta usa el decorador sin el guard: se falla cerrado en
  // vez de tratar la petición como anónima.
  if (!sesion) {
    throw new UnauthorizedException({ codigo: 'SIN_AUTENTICAR', mensaje: 'Necesitas iniciar sesión para hacer esto' });
  }
  return sesion.usuarioId;
});
