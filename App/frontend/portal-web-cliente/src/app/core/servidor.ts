/**
 * Dónde están los servicios del backend.
 *
 * En producción todo iría al API Gateway (ADR-02) con una sola dirección; en
 * desarrollo se habla directo con cada microservicio, igual que la app móvil
 * (`app-movil/lib/services/servidor.dart`):
 *
 * | Servicio | Puerto |
 * |---|---|
 * | Entradas y Mercado Secundario (CU-006) | 3001 |
 * | Administración: cuentas y sesiones (CU-027) | 3002 |
 * | Buzón del correo simulado (solo desarrollo) | 3098 |
 *
 * Se usa el mismo nombre de máquina con que se abrió el portal: así funciona
 * igual en `localhost` que abriéndolo desde otro equipo de la red.
 */
const host = typeof window === 'undefined' ? 'localhost' : window.location.hostname;

export const Servidor = {
  cuentas: `http://${host}:3002/api/v1`,
  entradas: `http://${host}:3001/api/v1`,
  buzonDesarrollo: `http://${host}:3098/correos`
} as const;
