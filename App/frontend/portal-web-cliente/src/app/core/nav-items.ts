export interface NavItem {
  ruta: string;
  etiqueta: string;
  icono: string;
  /**
   * true si la sección se puede ver sin iniciar sesión. La cartelera y el
   * mercado de reventa son públicos —un visitante debe poder mirar qué hay
   * antes de registrarse, como en cualquier taquilla—; las secciones que
   * muestran datos propios del cliente no.
   */
  publico: boolean;
}

/**
 * Menú del portal: las cuatro responsabilidades del contenedor (README) —
 * eventos, entradas (compra + reventa), parqueadero y pedidos. Un solo rol
 * (Cliente) usa este portal, así que a diferencia de portal-web-admin no hace
 * falta filtrar por rol, pero sí por si hay sesión iniciada.
 */
export const NAV_ITEMS: NavItem[] = [
  { ruta: 'eventos', etiqueta: 'Eventos', icono: 'event', publico: true }, // CU-001..CU-006
  { ruta: 'reventa', etiqueta: 'Mercado de reventa', icono: 'sync_alt', publico: true }, // CU-007, CU-008
  { ruta: 'entradas', etiqueta: 'Mis entradas', icono: 'confirmation_number', publico: false }, // CU-009, CU-010
  { ruta: 'parqueadero', etiqueta: 'Parqueadero', icono: 'local_parking', publico: false }, // CU-021..CU-025
  { ruta: 'pedidos', etiqueta: 'Pedidos', icono: 'restaurant', publico: false } // CU-011..CU-015
];
