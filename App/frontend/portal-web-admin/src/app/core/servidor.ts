/**
 * Dónde está el backend.
 *
 * Una sola dirección: el **API Gateway** (ADR-02), que autentica y enruta hacia
 * el microservicio que corresponda. El portal no sabe cuántos servicios hay ni
 * en qué puerto escucha cada uno.
 *
 * | Ruta | Va a |
 * |---|---|
 * | `/api/v1/sesiones`, `/api/v1/cuentas` | Administración — sesión propia (CU-027) |
 * | `/api/v1/admin/cuentas` | Administración — gestión de cuentas (CU-027B) |
 *
 * Se usa el mismo nombre de máquina con que se abrió el portal, igual que en
 * `portal-web-cliente`: así la misma imagen sirve en `localhost` y en el
 * computador de al lado, sin recompilar.
 */
const host = typeof window === 'undefined' ? 'localhost' : window.location.hostname;
const configuracion = typeof window === 'undefined' ? undefined :
  (window as Window & { HEXACORE_CONFIGURACION?: { api?: string } }).HEXACORE_CONFIGURACION;

// Rechazo al arrancar: una configuración externa errónea no se oculta con el valor por defecto.
function direccionApi(valor: unknown): string {
  if (valor === undefined) return `http://${host}:8080/api/v1`;
  if (typeof valor !== 'string' || !valor.trim() || valor !== valor.trim() ||
      valor.startsWith('//') || /[\\\r\n]/.test(valor)) {
    throw new Error('HEXACORE_CONFIGURACION.api inválida: use una URL HTTP(S) o una ruta absoluta');
  }
  let url: URL;
  try { url = new URL(valor, typeof window === 'undefined' ? 'http://localhost' : window.location.origin); }
  catch { throw new Error('HEXACORE_CONFIGURACION.api inválida: URL no interpretable'); }
  if ((!valor.startsWith('/') && !/^https?:\/\//.test(valor)) ||
      !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('HEXACORE_CONFIGURACION.api inválida: sin credenciales, consulta ni fragmento');
  }
  return valor.replace(/\/$/, '');
}

export const Servidor = {
  /** API Gateway: el único punto de entrada al backend. */
  api: direccionApi(configuracion?.api)
} as const;
