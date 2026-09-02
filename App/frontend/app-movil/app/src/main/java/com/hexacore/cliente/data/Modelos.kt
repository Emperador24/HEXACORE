package com.hexacore.cliente.data

import java.time.LocalDate
import java.time.LocalTime

/**
 * Modelos de datos básicos del cliente (SAD §4, modelo de dominio).
 * Por ahora son solo la forma de los datos que consumirá la UI; la carga real
 * vendrá del API Gateway cuando el backend esté disponible — ver [MockData].
 */

data class Evento(
    val id: String,
    val nombre: String,
    val fecha: String,
    val lugar: String,
    val precioDesde: Double,
    /** true si el evento ya ocurrió — separa "Próximos" de "Pasados" en Inicio. */
    val pasado: Boolean = false,
    /**
     * Fecha real del evento, solo para ordenar (más reciente primero) — [fecha]
     * es el texto ya formateado para mostrar y no se puede ordenar de forma fiable.
     */
    val fechaOrden: LocalDate,
    /**
     * Imagen/poster del evento, la sube el Administrador al crear el evento
     * desde el Portal Web; aquí llega como URL servida por el API Gateway. Si
     * un evento todavía no tiene imagen (o el backend no responde), la UI cae
     * en un poster con la inicial del nombre — ver `PosterPlaceholder`.
     */
    val imagenUrl: String? = null
)

enum class EstadoEntrada { VALIDA, EN_REVENTA, USADA }

/**
 * Boleta del cliente para un evento (CU-001..CU-010). Trae la localidad
 * asignada (zona/fila/silla) además del QR de ingreso, siguiendo el formato
 * de boleta con el que ya está familiarizado el cliente (p. ej. TuBoleta Pass).
 */
data class Entrada(
    val id: String,
    val eventoId: String,
    val eventoNombre: String,
    val fecha: String,
    val lugar: String,
    val zona: String,
    val fila: String,
    val silla: String,
    val codigoQr: String,
    val estado: EstadoEntrada,
    /** Identifica esta boleta puntual — único por entrada, para trazabilidad/soporte. */
    val numeroTicket: String,
    /** Identifica el pago con el que se generó esta entrada — único, para conciliar con el cobro. */
    val numeroTransaccion: String
)

/**
 * Reserva de parqueadero ya pagada por el cliente (CU-021..CU-025). Al igual
 * que una [Entrada], una vez pagada trae su propio QR para el ingreso/salida
 * del vehículo — no se genera hasta que el pago se confirma. Incluye el
 * lugar del evento (para el botón "Cómo llegar") y la hora de ingreso una
 * vez el personal de parqueadero registra que el vehículo ya entró, para
 * poder mostrar cuánto tiempo lleva parqueado.
 */
data class ReservaParqueadero(
    val id: String,
    val eventoNombre: String,
    val lugarEvento: String,
    val espacioId: String,
    val zona: String,
    val codigoQr: String,
    val horaIngreso: LocalTime? = null
)

// El pedido nace sin pagar (sin QR); al confirmarse el pago se le asigna el
// código QR que el cliente muestra en el establecimiento para retirarlo.
enum class EstadoPedido { PENDIENTE_PAGO, EN_PREPARACION, LISTO, ENTREGADO }

data class Pedido(
    val id: String,
    val establecimiento: String,
    val items: List<String>,
    val total: Double,
    val estado: EstadoPedido,
    val codigoQr: String? = null
)

/** Punto de comida del evento (CU-011..CU-015) donde el cliente puede pedir. */
data class Establecimiento(
    val id: String,
    val nombre: String,
    val descripcion: String
)

/** Producto del menú de un [Establecimiento]. */
data class ProductoMenu(
    val id: String,
    val establecimientoId: String,
    val nombre: String,
    val precio: Double,
    val disponible: Boolean = true
)

/** Línea del pedido que el cliente está armando antes de pagar. */
data class ItemCarrito(
    val producto: ProductoMenu,
    val cantidad: Int
)
