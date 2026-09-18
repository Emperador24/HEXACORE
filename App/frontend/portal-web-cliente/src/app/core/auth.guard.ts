import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Protege las secciones que muestran datos propios del cliente. Si no hay
 * sesión, manda a /login recordando a dónde iba el usuario (`returnUrl`) para
 * devolverlo ahí después de iniciar sesión, en vez de dejarlo en la cartelera
 * y obligarlo a volver a navegar.
 *
 * Al recargar la página, la sesión se recupera antes de que se evalúe ninguna
 * ruta (ver `provideAppInitializer` en app.config.ts), así que aquí basta con
 * mirar si hay usuario.
 */
export const authGuard: CanActivateFn = (_ruta, estado) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.usuarioActual()) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: estado.url } });
};

/**
 * Para login y registro: quien ya tiene sesión no tiene nada que hacer ahí y
 * vuelve a la cartelera.
 */
export const soloInvitadosGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.usuarioActual() ? router.createUrlTree(['/eventos']) : true;
};
