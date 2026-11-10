/**
 * Dónde corre la demostración y con qué cuentas. Todo se puede cambiar por
 * variable de entorno; los valores por defecto son el entorno local habitual
 * (`App/infra`, perfil `servicios`) con los datos de demo (`--datos-demo`).
 * Las contraseñas de esas cuentas son fixtures públicos de desarrollo.
 */
const v = (nombre: string, defecto: string) => process.env[nombre] || defecto;

export const ENTORNO = {
  portalAdmin: v('DEMO_PORTAL_ADMIN', 'http://localhost:4201'),
  portalCliente: v('DEMO_PORTAL_CLIENTE', 'http://localhost:4200'),
  api: v('DEMO_API', 'http://localhost:8080/api/v1'),
  /** Buzón del correo simulado: de ahí sale el enlace para verificar la cuenta del empleado nuevo. */
  buzon: v('DEMO_BUZON', 'http://localhost:3098/correos'),
  contrasena: v('DEMO_CONTRASENA', 'hexacore2026'),
  cuentas: {
    /** Crea y publica eventos, supervisa personal, emergencias y parqueadero. */
    organizador: v('DEMO_ORGANIZADOR', 'organizador@hexacore.com'),
    /** Da de alta empleados y fija la tarifa del parqueadero. */
    administrador: v('DEMO_ADMINISTRADOR', 'admin@hexacore.com'),
    /** CU-006: vende una de sus entradas. */
    vendedora: v('DEMO_VENDEDORA', 'cliente@hexacore.com'),
    /** CU-006: la compra en el mercado secundario. */
    comprador: v('DEMO_COMPRADOR', 'bruno@hexacore.com'),
  },
  /** Cuenta ya verificada para la ficha nueva de CU-007; si falta, se registra una con el buzón. */
  cuentaEmpleado: process.env.DEMO_CUENTA_EMPLEADO,
};
