/**
 * Modelos del Portal Web Cliente (SAD §8, vista de contenedores). Por ahora
 * son solo la forma de los datos que consume la UI con datos mock — la carga
 * real vendrá del API Gateway (`../../gateway`) cuando el backend esté
 * disponible, sin duplicar lógica de negocio (ASR-10). El dominio replica a
 * propósito el de app-movil-cliente (ver data/Modelos.kt allá) para que
 * ambos clientes hablen el mismo lenguaje frente al mismo backend.
 */

/** Quien tiene la sesión abierta, tal como lo devuelve el Servicio de Administración (CU-027). */
export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  /** Roles del CU-028. El portal solo admite cuentas con `Cliente`. */
  roles: string[];
}

/**
 * Categoría comercial del evento. Es lo que el cliente usa para filtrar en la
 * página de eventos, igual que las taquillas de referencia (Conciertos,
 * Teatro, Deportes…); no tiene efecto en la lógica de compra.
 */
export type CategoriaEvento = 'Conciertos' | 'Teatro' | 'Deportes' | 'Festivales' | 'Gastronomía';

export const CATEGORIAS: CategoriaEvento[] = [
  'Conciertos',
  'Teatro',
  'Deportes',
  'Festivales',
  'Gastronomía'
];

export interface Evento {
  id: string;
  nombre: string;
  /** yyyy-MM-dd, tal como lo entrega un <input type="date">. */
  fecha: string;
  /** Recinto: "Movistar Arena". Se muestra junto a la ciudad. */
  lugar: string;
  /** Ciudad del recinto — es uno de los filtros de la página de eventos. */
  ciudad: string;
  categoria: CategoriaEvento;
  precioDesde: number;
  /** true si el evento ya ocurrió — separa "Próximos" de "Pasados". */
  pasado: boolean;
  imagenUrl: string | null;
  /** Zonas/localidades disponibles para la compra, cada una con su precio. */
  zonas: ZonaEvento[];
}

export interface ZonaEvento {
  nombre: string;
  precio: number;
  /** Id de la localidad en el backend: es lo que se manda al reservar (CU-001). */
  id?: string;
  /** Cupos que quedan, ya descontadas las reservas sin pagar. */
  disponibles?: number;
  agotada?: boolean;
}

export enum EstadoEntrada {
  VALIDA = 'VALIDA',
  EN_REVENTA = 'EN_REVENTA',
  USADA = 'USADA'
}

/**
 * Boleta del cliente para un evento (CU-001..CU-010). Una vez comprada trae
 * su propio QR de ingreso — igual que en app-movil-cliente, así una entrada
 * generada aquí se reconoce también allá.
 */
export interface Entrada {
  id: string;
  eventoId: string;
  eventoNombre: string;
  fecha: string;
  lugar: string;
  zona: string;
  codigoQr: string;
  estado: EstadoEntrada;
  /** Identifica esta boleta puntual — único, para trazabilidad/soporte. */
  numeroTicket: string;
  /** Identifica el pago con el que se generó esta entrada — único, para conciliar con el cobro. */
  numeroTransaccion: string;
  /** Dueño actual — cambia al confirmarse una compra en el mercado de reventa. */
  propietarioId: string;
  /** Precio al que quedó publicada en el mercado de reventa; solo aplica si estado = EN_REVENTA. */
  precioReventa?: number;
}

export interface ReservaParqueadero {
  id: string;
  eventoId: string;
  eventoNombre: string;
  lugarEvento: string;
  zona: string;
  espacioId: string;
  codigoQr: string;
  numeroTransaccion: string;
}

// El pedido nace sin pagar (sin QR); al confirmarse el pago se le asigna el
// código QR que el cliente muestra en el establecimiento para retirarlo.
export enum EstadoPedido {
  EN_PREPARACION = 'EN_PREPARACION',
  LISTO = 'LISTO',
  ENTREGADO = 'ENTREGADO'
}

export interface Pedido {
  id: string;
  establecimiento: string;
  items: string[];
  total: number;
  estado: EstadoPedido;
  codigoQr: string;
}

/** Punto de comida del evento (CU-011..CU-015) donde el cliente puede pedir. */
export interface Establecimiento {
  id: string;
  nombre: string;
  descripcion: string;
}

/** Producto del menú de un [Establecimiento]. */
export interface ProductoMenu {
  id: string;
  establecimientoId: string;
  nombre: string;
  precio: number;
  disponible: boolean;
}

/** Línea del pedido que el cliente está armando antes de pagar. */
export interface ItemCarrito {
  producto: ProductoMenu;
  cantidad: number;
}

export enum MetodoPago {
  TARJETA = 'TARJETA',
  EFECTIVO = 'EFECTIVO',
  PSE = 'PSE'
}

/** Una línea del resumen que se muestra en la pasarela de pago. */
export interface LineaResumenPago {
  etiqueta: string;
  cantidad: number;
  precioUnitario: number;
}

/**
 * Descriptor de un pago pendiente: cualquier flujo de compra (entradas,
 * parqueadero, pedido) lo registra en [PagoService] antes de navegar a
 * `/pago`, y esa pantalla es la única que sabe mostrar un resumen y cobrar —
 * ninguna otra pantalla duplica esa lógica (ASR-10).
 */
export interface PagoPendiente {
  titulo: string;
  lineas: LineaResumenPago[];
  /**
   * Se ejecuta al confirmar el pago. Si devuelve una promesa, la pasarela la
   * espera: si falla, muestra el error y deja el pago pendiente para reintentar
   * (así funciona el CU-001C, donde la reserva sigue viva tras un rechazo).
   * El segundo argumento es el token del medio de pago elegido, si lo hay.
   */
  onConfirmar: (metodo: MetodoPago, token?: string) => void | Promise<void>;
  /** Medios que admite esta compra. Si falta, se ofrecen todos. */
  metodos?: MetodoPago[];
  /**
   * Tokens de la pasarela simulada para demostrar cada camino (aprobado,
   * rechazado…), como en la reventa. Si falta, no se muestra el selector.
   */
  tokensDemo?: { valor: string; etiqueta: string }[];
  /** A dónde volver después de confirmar. */
  rutaDestino: string;
}
