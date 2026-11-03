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
  /** Sección todavía sin construir: se muestra, pero marcada. */
  pendiente?: boolean;
}

export interface NavGrupo {
  titulo: string;
  items: NavItem[];
}

const { ORGANIZADOR, ADMINISTRADOR } = Rol;

/** Cada sección referencia el caso de uso que cubre (ver CU_eventos_completo.xlsx). */
export const NAV_GRUPOS: NavGrupo[] = [
  {
    titulo: 'General',
    items: [{ ruta: 'inicio', etiqueta: 'Inicio', icono: 'space_dashboard', roles: [ORGANIZADOR, ADMINISTRADOR] }]
  },
  {
    titulo: 'Operación',
    items: [
      { ruta: 'eventos', etiqueta: 'Eventos', icono: 'event', roles: [ORGANIZADOR, ADMINISTRADOR] }, // CU-026
      // CU-007: el administrador gestiona las fichas y el organizador asigna.
      { ruta: 'personal', etiqueta: 'Personal', icono: 'badge', roles: [ORGANIZADOR, ADMINISTRADOR] },
      { ruta: 'monitoreo', etiqueta: 'Monitoreo', icono: 'monitor_heart', roles: [ORGANIZADOR, ADMINISTRADOR], pendiente: true }, // CU-019
      { ruta: 'incidentes', etiqueta: 'Incidentes', icono: 'report', roles: [ORGANIZADOR, ADMINISTRADOR], pendiente: true }, // CU-020
      { ruta: 'emergencias', etiqueta: 'Emergencias', icono: 'emergency', roles: [ADMINISTRADOR], pendiente: true } // CU-010
    ]
  },
  {
    titulo: 'Administración',
    items: [
      { ruta: 'cuentas', etiqueta: 'Cuentas', icono: 'manage_accounts', roles: [ADMINISTRADOR] }, // CU-027B
      { ruta: 'roles', etiqueta: 'Roles y permisos', icono: 'admin_panel_settings', roles: [ADMINISTRADOR], pendiente: true }, // CU-028
      { ruta: 'recintos', etiqueta: 'Recintos y zonas', icono: 'location_city', roles: [ADMINISTRADOR], pendiente: true }, // CU-029
      { ruta: 'proveedores', etiqueta: 'Proveedores', icono: 'local_shipping', roles: [ADMINISTRADOR, ORGANIZADOR], pendiente: true }, // CU-030
      { ruta: 'pagos', etiqueta: 'Pagos y conciliación', icono: 'payments', roles: [ADMINISTRADOR], pendiente: true }, // CU-031
      { ruta: 'reportes', etiqueta: 'Reportes', icono: 'bar_chart', roles: [ADMINISTRADOR, ORGANIZADOR], pendiente: true } // CU-032
    ]
  }
];

/** Las mismas secciones sin agrupar, para quien solo necesita la lista. */
export const NAV_ITEMS: NavItem[] = NAV_GRUPOS.flatMap((g) => g.items);
