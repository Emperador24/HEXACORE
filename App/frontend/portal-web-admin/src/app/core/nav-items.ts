import { Rol } from './models';

export interface NavItem {
  ruta: string;
  etiqueta: string;
  icono: string;
  /**
   * Qué roles ven esta sección — misma idea que `destinosPara(cargo)` en la app
   * móvil. Los nombres son los del Servicio de Administración (tabla `roles`),
   * no una lista propia del portal: un rol inventado aquí no se lo puede
   * asignar nadie, y la sección quedaría invisible para siempre.
   */
  roles: string[];
}

const { ORGANIZADOR, ADMINISTRADOR } = Rol;

/** Cada sección referencia el caso de uso que cubre (ver CU_eventos_completo.xlsx). */
export const NAV_ITEMS: NavItem[] = [
  { ruta: 'inicio', etiqueta: 'Inicio', icono: 'dashboard', roles: [ORGANIZADOR, ADMINISTRADOR] },
  { ruta: 'eventos', etiqueta: 'Eventos', icono: 'event', roles: [ORGANIZADOR, ADMINISTRADOR] }, // CU-016, CU-026
  { ruta: 'personal', etiqueta: 'Personal', icono: 'groups', roles: [ORGANIZADOR] }, // CU-017, CU-018
  { ruta: 'monitoreo', etiqueta: 'Monitoreo', icono: 'monitor_heart', roles: [ORGANIZADOR, ADMINISTRADOR] }, // CU-019
  { ruta: 'incidentes', etiqueta: 'Incidentes', icono: 'report', roles: [ORGANIZADOR, ADMINISTRADOR] }, // CU-020
  { ruta: 'emergencias', etiqueta: 'Emergencias', icono: 'emergency', roles: [ADMINISTRADOR] }, // CU-010
  { ruta: 'cuentas', etiqueta: 'Cuentas', icono: 'manage_accounts', roles: [ADMINISTRADOR] }, // CU-027B
  { ruta: 'roles', etiqueta: 'Roles y permisos', icono: 'admin_panel_settings', roles: [ADMINISTRADOR] }, // CU-028
  { ruta: 'recintos', etiqueta: 'Recintos y zonas', icono: 'location_city', roles: [ADMINISTRADOR] }, // CU-029
  { ruta: 'proveedores', etiqueta: 'Proveedores', icono: 'local_shipping', roles: [ADMINISTRADOR, ORGANIZADOR] }, // CU-030
  { ruta: 'pagos', etiqueta: 'Pagos y conciliación', icono: 'payments', roles: [ADMINISTRADOR] }, // CU-031
  { ruta: 'reportes', etiqueta: 'Reportes', icono: 'bar_chart', roles: [ADMINISTRADOR, ORGANIZADOR] } // CU-032
];
