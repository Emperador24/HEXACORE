import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Redirige a /login si todavía no hay sesión iniciada (sin persistencia entre recargas, por ahora). */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.usuarioActual()) return true;
  return router.parseUrl('/login');
};
