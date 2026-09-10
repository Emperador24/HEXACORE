export interface NavItem {
  ruta: string;
  etiqueta: string;
  icono: string;
}

/**
 * Menú lateral del portal: las cuatro responsabilidades del contenedor
 * (README) — eventos, entradas (compra + reventa), parqueadero y pedidos.
 * Un solo rol (Cliente) usa este portal, así que a diferencia de
 * portal-web-admin no hace falta filtrar por rol.
 */
export const NAV_ITEMS: NavItem[] = [
  { ruta: 'eventos', etiqueta: 'Eventos', icono: 'event' }, // CU-001..CU-006
  { ruta: 'entradas', etiqueta: 'Mis entradas', icono: 'confirmation_number' }, // CU-009, CU-010
  { ruta: 'reventa', etiqueta: 'Mercado de reventa', icono: 'sync_alt' }, // CU-007, CU-008
  { ruta: 'parqueadero', etiqueta: 'Parqueadero', icono: 'local_parking' }, // CU-021..CU-025
  { ruta: 'pedidos', etiqueta: 'Pedidos', icono: 'restaurant' } // CU-011..CU-015
];
