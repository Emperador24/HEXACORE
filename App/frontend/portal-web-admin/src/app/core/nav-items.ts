import { RolAdmin } from './models';

export interface NavItem {
  ruta: string;
  etiqueta: string;
  icono: string;
  /** Qué roles ven esta sección en el menú — igual idea que destinosPara(cargo) en el móvil. */
  roles: RolAdmin[];
}

const { ORGANIZADOR, ADMINISTRADOR, SUPERVISOR_EMERGENCIA } = RolAdmin;

/** Cada sección referencia el caso de uso que cubre (ver CU_eventos_completo.xlsx). */
export const NAV_ITEMS: NavItem[] = [
  { ruta: 'inicio', etiqueta: 'Inicio', icono: 'dashboard', roles: [ORGANIZADOR, ADMINISTRADOR, SUPERVISOR_EMERGENCIA] },
  { ruta: 'eventos', etiqueta: 'Eventos', icono: 'event', roles: [ORGANIZADOR, ADMINISTRADOR] }, // CU-016, CU-026
  { ruta: 'personal', etiqueta: 'Personal', icono: 'groups', roles: [ORGANIZADOR] }, // CU-017, CU-018
  { ruta: 'monitoreo', etiqueta: 'Monitoreo', icono: 'monitor_heart', roles: [ORGANIZADOR, SUPERVISOR_EMERGENCIA] }, // CU-019
  { ruta: 'incidentes', etiqueta: 'Incidentes', icono: 'report', roles: [ORGANIZADOR, SUPERVISOR_EMERGENCIA] }, // CU-020
  { ruta: 'emergencias', etiqueta: 'Emergencias', icono: 'emergency', roles: [SUPERVISOR_EMERGENCIA] }, // CU-010
  { ruta: 'cuentas', etiqueta: 'Cuentas', icono: 'manage_accounts', roles: [ADMINISTRADOR] }, // CU-027
  { ruta: 'roles', etiqueta: 'Roles y permisos', icono: 'admin_panel_settings', roles: [ADMINISTRADOR] }, // CU-028
  { ruta: 'recintos', etiqueta: 'Recintos y zonas', icono: 'location_city', roles: [ADMINISTRADOR] }, // CU-029
  { ruta: 'proveedores', etiqueta: 'Proveedores', icono: 'local_shipping', roles: [ADMINISTRADOR, ORGANIZADOR] }, // CU-030
  { ruta: 'pagos', etiqueta: 'Pagos y conciliación', icono: 'payments', roles: [ADMINISTRADOR] }, // CU-031
  { ruta: 'reportes', etiqueta: 'Reportes', icono: 'bar_chart', roles: [ADMINISTRADOR, ORGANIZADOR] } // CU-032
];
