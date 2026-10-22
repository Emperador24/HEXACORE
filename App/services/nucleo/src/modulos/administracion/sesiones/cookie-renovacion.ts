import { Request, Response } from 'express';

/**
 * Token de renovación en cookie, para los clientes web (DECISIONES.md §22).
 *
 * En un navegador, lo que guarde JavaScript (`localStorage`, memoria) lo puede
 * leer cualquier script inyectado en la página. El token de renovación dura
 * 30 días: robarlo sería robar la sesión. Por eso, para la web, viaja en una
 * cookie que JavaScript no puede leer (`HttpOnly`), que solo se envía a las
 * rutas de sesión (`Path`) y nunca desde otro sitio (`SameSite=Strict`).
 *
 * La app móvil no cambia: guarda el token en el llavero y lo manda en el
 * cuerpo. Quién es web lo dice la cabecera `X-Hexacore-Cliente: web`, que
 * además obliga al navegador a hacer una comprobación CORS previa: una página
 * ajena no puede enviarla.
 */

export const COOKIE_RENOVACION = 'hxc_renovacion';
export const CABECERA_CLIENTE = 'x-hexacore-cliente';

export function esClienteWeb(peticion: Request): boolean {
  return peticion.headers[CABECERA_CLIENTE] === 'web';
}

export function leerCookieRenovacion(peticion: Request): string | undefined {
  const cabecera = peticion.headers.cookie;
  if (!cabecera) return undefined;
  for (const parte of cabecera.split(';')) {
    const [nombre, ...valor] = parte.trim().split('=');
    if (nombre === COOKIE_RENOVACION) return decodeURIComponent(valor.join('='));
  }
  return undefined;
}

export interface OpcionesCookie {
  /** Ruta de las sesiones, con el prefijo de la API: `/api/v1/sesiones`. */
  ruta: string;
  /** `Secure` en producción: la cookie solo viaja por HTTPS. */
  segura: boolean;
}

export function escribirCookieRenovacion(
  respuesta: Response,
  token: string,
  expiraEn: Date,
  opciones: OpcionesCookie,
): void {
  respuesta.cookie(COOKIE_RENOVACION, token, {
    httpOnly: true,
    secure: opciones.segura,
    sameSite: 'strict',
    path: opciones.ruta,
    expires: expiraEn,
  });
}

export function borrarCookieRenovacion(respuesta: Response, opciones: OpcionesCookie): void {
  respuesta.clearCookie(COOKIE_RENOVACION, {
    httpOnly: true,
    secure: opciones.segura,
    sameSite: 'strict',
    path: opciones.ruta,
  });
}
