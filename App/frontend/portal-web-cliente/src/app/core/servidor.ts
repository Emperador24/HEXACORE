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

export const Servidor = {
  /** API Gateway: el único punto de entrada al backend. */
  api: `http://${host}:8080/api/v1`,

  /**
   * Buzón del correo simulado. **Solo desarrollo**, y no pasa por el gateway:
   * no es parte del sistema, sino el proveedor de notificaciones simulado
   * (`App/infra/correo-simulado`), donde se leen los enlaces de los correos.
   */
  buzonDesarrollo: `http://${host}:3098/correos`
} as const;
