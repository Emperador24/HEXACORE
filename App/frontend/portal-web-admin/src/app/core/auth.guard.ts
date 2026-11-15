import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { NAV_ITEMS } from './nav-items';

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

/**
 * Personal accede solo a sus pantallas operativas, también por URL directa; un
 * rol propio (CU-028), solo a las secciones de los módulos que puede leer.
 */
export const destinoGuard: CanActivateChildFn = (ruta) => {
  const auth = inject(AuthService), router = inject(Router);
  const roles = auth.roles();
  const camino = ruta.routeConfig?.path ?? '';
  const organiza = roles.some(r => r === 'Organizador' || r === 'Administrador');
  if (['menu', 'preparacion'].includes(camino)) return roles.includes('Personal') || router.parseUrl(organiza ? '/admin/inicio' : inicioDe(auth));
  if (organiza) return true;
  const seccion = NAV_ITEMS.find(i => i.ruta === camino.split('/')[0]);
  if (seccion?.modulo && auth.puedeVer(seccion)) return true;
  return router.parseUrl(inicioDe(auth));
};

/** Primera pantalla de quien no organiza: la primera sección que puede ver, o el menú del Personal. */
function inicioDe(auth: AuthService): string {
  const seccion = NAV_ITEMS.find(i => i.modulo && !i.pendiente && auth.puedeVer(i));
  if (seccion) return `/admin/${seccion.ruta}`;
  return auth.roles().includes('Personal') ? '/admin/menu' : '/login';
}
