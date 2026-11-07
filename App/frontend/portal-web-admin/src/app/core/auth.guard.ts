import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Deja entrar solo con sesión iniciada.
 *
 * Antes de decidir intenta **restaurarla** con la cookie de renovación: al
 * recargar la página el token de acceso vive solo en memoria y se pierde, así
 * que sin este paso una recarga echaría fuera a quien sí tiene sesión. Si no
 * hay cookie válida, `restaurar` no hace nada y se va al login.
 */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.usuarioActual()) await auth.restaurar();
  return auth.usuarioActual() ? true : router.parseUrl('/login');
};

/** Personal accede solo a sus pantallas operativas, también por URL directa. */
export const destinoGuard: CanActivateChildFn = (ruta) => {
  const auth = inject(AuthService), router = inject(Router);
  const roles = auth.roles();
  if (['menu', 'preparacion'].includes(ruta.routeConfig?.path ?? '')) return roles.includes('Personal') || router.parseUrl('/admin/inicio');
  return roles.some(r => r === 'Organizador' || r === 'Administrador') || router.parseUrl('/admin/menu');
};
