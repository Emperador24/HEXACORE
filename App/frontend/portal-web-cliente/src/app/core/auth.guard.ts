import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Protege las secciones que muestran datos propios del cliente. Si no hay
 * sesión, manda a /login recordando a dónde iba el usuario (`returnUrl`) para
 * devolverlo ahí después de iniciar sesión, en vez de dejarlo en la cartelera
 * y obligarlo a volver a navegar.
 *
 * Sin persistencia entre recargas todavía: al recargar la página se pierde la
 * sesión, porque AuthService la guarda solo en memoria.
 */
export const authGuard: CanActivateFn = (_ruta, estado) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.usuarioActual()) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: estado.url } });
};
