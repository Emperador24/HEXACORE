/**
 * Modelos del Portal Web Cliente (SAD §8, vista de contenedores). Por ahora
 * son solo la forma de los datos que consume la UI con datos mock — la carga
 * real vendrá del API Gateway (`../../gateway`) cuando el backend esté
 * disponible, sin duplicar lógica de negocio (ASR-10). El dominio replica a
 * propósito el de app-movil-cliente (ver data/Modelos.kt allá) para que
 * ambos clientes hablen el mismo lenguaje frente al mismo backend.
 */

export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  telefono: string;
  /** URL/dataURL de la foto de perfil; sin valor hasta que el cliente suba una. */
  fotoUrl: string | null;
}

export interface Evento {
  id: string;
  nombre: string;
  /** yyyy-MM-dd, tal como lo entrega un <input type="date">. */
  fecha: string;
  lugar: string;
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
  EFECTIVO = 'EFECTIVO'
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
  /** Se ejecuta al confirmar el pago; falla en silencio si ya no hay pago pendiente. */
  onConfirmar: (metodo: MetodoPago) => void;
  /** A dónde volver después de confirmar. */
  rutaDestino: string;
}
