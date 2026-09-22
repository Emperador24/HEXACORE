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

export const Servidor = {
  /** API Gateway: el único punto de entrada al backend. */
  api: `http://${host}:8080/api/v1`
} as const;
