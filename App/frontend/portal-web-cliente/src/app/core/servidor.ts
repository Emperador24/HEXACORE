/**
 * Dónde está el backend.
 *
 * Una sola dirección: el **API Gateway** (ADR-02), que autentica y enruta hacia
 * el microservicio que corresponda. Antes había que conocer el puerto de cada
 * servicio; ahora el portal no sabe cuántos hay ni dónde están.
 *
 * | Ruta | Va a |
 * |---|---|
 * | `/api/v1/sesiones`, `/api/v1/cuentas`, `/api/v1/admin` | Administración (CU-027) |
 * | `/api/v1/reventa` | Entradas y Mercado Secundario (CU-006) |
 *
 * Se usa el mismo nombre de máquina con que se abrió el portal, así funciona
 * igual en `localhost` que abriéndolo desde otro equipo de la red.
 */
const host = typeof window === 'undefined' ? 'localhost' : window.location.hostname;
// Configuración del despliegue estático, cargada antes de Angular por index.html.
const configuracion = typeof window === 'undefined' ? undefined :
  (window as Window & { HEXACORE_CONFIGURACION?: { api?: string; buzonDesarrollo?: string } }).HEXACORE_CONFIGURACION;

// Rechazo al arrancar: una configuración externa errónea no se oculta con el valor por defecto.
function direccionApi(valor: unknown): string {
  if (valor === undefined) return `http://${host}:8080/api/v1`;
  if (typeof valor !== 'string' || !valor.trim() || valor !== valor.trim() ||
      valor.startsWith('//') || /[\\\r\n]/.test(valor)) {
    throw new Error('HEXACORE_CONFIGURACION.api inválida: use una URL HTTP(S) o una ruta absoluta');
  }
  const url = new URL(valor, typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
  if ((!valor.startsWith('/') && !/^https?:\/\//.test(valor)) ||
      !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('HEXACORE_CONFIGURACION.api inválida: sin credenciales, consulta ni fragmento');
  }
  return valor.replace(/\/$/, '');
}

export const Servidor = {
  /** API Gateway: el único punto de entrada al backend. */
  api: direccionApi(configuracion?.api),

  /**
   * Buzón del correo simulado. **Solo desarrollo**, y no pasa por el gateway:
   * no es parte del sistema, sino el proveedor de notificaciones simulado
   * (`App/infra/correo-simulado`), donde se leen los enlaces de los correos.
   */
  buzonDesarrollo: configuracion?.buzonDesarrollo ?? `http://${host}:3098/correos`
} as const;
