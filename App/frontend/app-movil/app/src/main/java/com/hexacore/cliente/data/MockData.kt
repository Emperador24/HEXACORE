package com.hexacore.cliente.data

import java.time.LocalDate
import java.time.LocalTime

/**
 * Datos de ejemplo en memoria para poder construir y navegar la UI antes de
 * que exista el API Gateway real (SAD §5). Se reemplaza por llamadas HTTP
 * cuando el backend esté disponible — la UI ya consume estos modelos por
 * `List<T>`, así que el cambio queda aislado a esta capa.
 */
object MockData {

    val eventos = listOf(
        Evento(
            id = "evt-1",
            nombre = "HEXACORE Fest 2026",
            fecha = "12 dic 2026",
            lugar = "Movistar Arena, Bogotá",
            precioDesde = 180000.0,
            fechaOrden = LocalDate.of(2026, 12, 12),
            imagenUrl = "https://picsum.photos/seed/evt-1/600/800"
        ),
        Evento(
            id = "evt-2",
            nombre = "Noche de Rock Nacional",
            fecha = "20 sep 2026",
            lugar = "Coliseo El Campín, Bogotá",
            precioDesde = 95000.0,
            fechaOrden = LocalDate.of(2026, 9, 20),
            imagenUrl = "https://picsum.photos/seed/evt-2/600/800"
        ),
        Evento(
            id = "evt-3",
            nombre = "Feria Gastronómica",
            fecha = "5 oct 2026",
            lugar = "Corferias, Bogotá",
            precioDesde = 40000.0,
            fechaOrden = LocalDate.of(2026, 10, 5),
            imagenUrl = "https://picsum.photos/seed/evt-3/600/800"
        ),
        Evento(
            id = "evt-4",
            nombre = "Festival de Verano 2026",
            fecha = "15 jun 2026",
            lugar = "Parque Simón Bolívar, Bogotá",
            precioDesde = 65000.0,
            pasado = true,
            fechaOrden = LocalDate.of(2026, 6, 15),
            imagenUrl = "https://picsum.photos/seed/evt-4/600/800"
        )
    )

    val entradas = listOf(
        Entrada(
            id = "ent-1",
            eventoId = "evt-1",
            eventoNombre = "HEXACORE Fest 2026",
            fecha = "12 dic 2026 · 7:00 p. m.",
            lugar = "Movistar Arena, Bogotá",
            zona = "Platea Baja",
            fila = "12",
            silla = "34",
            codigoQr = "HXC-QR-000123",
            estado = EstadoEntrada.VALIDA,
            numeroTicket = "TCK-2026-000123",
            numeroTransaccion = "TXN-2026-000501"
        ),
        Entrada(
            id = "ent-2",
            eventoId = "evt-2",
            eventoNombre = "Noche de Rock Nacional",
            fecha = "20 sep 2026 · 8:00 p. m.",
            lugar = "Coliseo El Campín, Bogotá",
            zona = "General",
            fila = "—",
            silla = "—",
            codigoQr = "HXC-QR-000124",
            estado = EstadoEntrada.EN_REVENTA,
            numeroTicket = "TCK-2026-000124",
            numeroTransaccion = "TXN-2026-000502"
        ),
        Entrada(
            id = "ent-3",
            eventoId = "evt-4",
            eventoNombre = "Festival de Verano 2026",
            fecha = "15 jun 2026 · 2:00 p. m.",
            lugar = "Parque Simón Bolívar, Bogotá",
            zona = "General",
            fila = "—",
            silla = "—",
            codigoQr = "HXC-QR-000099",
            estado = EstadoEntrada.USADA,
            numeroTicket = "TCK-2026-000099",
            numeroTransaccion = "TXN-2026-000399"
        )
    )

    // Recién pagada: todavía no tiene hora de ingreso porque el personal de
    // parqueadero aún no valida el QR en la entrada — el conteo de horas
    // arranca solo hasta que eso pase, ver ParqueaderoScreen (Cliente).
    val reservaParqueadero = ReservaParqueadero(
        id = "res-1",
        eventoNombre = "HEXACORE Fest 2026",
        lugarEvento = "Movistar Arena, Bogotá",
        espacioId = "B-04",
        zona = "Zona B",
        codigoQr = "HXC-PARK-000045",
        horaIngreso = null
    )

    val pedidos = listOf(
        Pedido(
            id = "ped-0",
            establecimiento = "Cervecería del Parche",
            items = listOf("2x Cerveza artesanal"),
            total = 32000.0,
            estado = EstadoPedido.PENDIENTE_PAGO
        ),
        Pedido(
            id = "ped-1",
            establecimiento = "Food Truck La Sazón",
            items = listOf("2x Hamburguesa", "1x Gaseosa"),
            total = 58000.0,
            estado = EstadoPedido.EN_PREPARACION,
            codigoQr = "HXC-PED-000045"
        ),
        Pedido(
            id = "ped-2",
            establecimiento = "Cafetería Central",
            items = listOf("1x Café", "1x Croissant"),
            total = 21000.0,
            estado = EstadoPedido.ENTREGADO,
            codigoQr = "HXC-PED-000039"
        )
    )

    // --- Cliente: restaurantes y menú para armar un pedido nuevo ---

    val establecimientos = listOf(
        Establecimiento(id = "est-1", nombre = "Food Truck La Sazón", descripcion = "Comida rápida"),
        Establecimiento(id = "est-2", nombre = "Cafetería Central", descripcion = "Café y repostería"),
        Establecimiento(id = "est-3", nombre = "Cervecería del Parche", descripcion = "Cerveza artesanal y piqueos")
    )

    val menu = listOf(
        ProductoMenu(id = "prod-1", establecimientoId = "est-1", nombre = "Hamburguesa", precio = 25000.0),
        ProductoMenu(id = "prod-2", establecimientoId = "est-1", nombre = "Perro caliente", precio = 18000.0),
        ProductoMenu(id = "prod-3", establecimientoId = "est-1", nombre = "Papas fritas", precio = 12000.0),
        ProductoMenu(id = "prod-4", establecimientoId = "est-1", nombre = "Gaseosa", precio = 6000.0),
        ProductoMenu(id = "prod-5", establecimientoId = "est-2", nombre = "Café", precio = 8000.0),
        ProductoMenu(id = "prod-6", establecimientoId = "est-2", nombre = "Croissant", precio = 9000.0),
        ProductoMenu(id = "prod-7", establecimientoId = "est-2", nombre = "Jugo natural", precio = 7000.0, disponible = false),
        ProductoMenu(id = "prod-8", establecimientoId = "est-3", nombre = "Cerveza artesanal", precio = 16000.0),
        ProductoMenu(id = "prod-9", establecimientoId = "est-3", nombre = "Nachos", precio = 20000.0)
    )

    val turnos = listOf(
        Turno(
            id = "trn-1",
            eventoNombre = "HEXACORE Fest 2026",
            zona = "Puerta Norte",
            fecha = "12 dic 2026",
            horaInicio = "3:00 p. m.",
            horaFin = "11:00 p. m."
        ),
        Turno(
            id = "trn-2",
            eventoNombre = "Noche de Rock Nacional",
            zona = "Zona de Parqueadero",
            fecha = "20 sep 2026",
            horaInicio = "5:00 p. m.",
            horaFin = "10:00 p. m."
        )
    )

    // --- Cargo: Entrada — validación de boletas en la puerta ---

    val entradasPorValidar = listOf(
        EntradaPorValidar(id = "epv-1", eventoNombre = "HEXACORE Fest 2026", zona = "Platea Baja", codigoQr = "HXC-QR-000123"),
        EntradaPorValidar(id = "epv-2", eventoNombre = "HEXACORE Fest 2026", zona = "General", codigoQr = "HXC-QR-000201"),
        EntradaPorValidar(id = "epv-3", eventoNombre = "HEXACORE Fest 2026", zona = "Palco VIP", codigoQr = "HXC-QR-000202")
    )

    // --- Cargo: Parqueadero — ingreso/salida y cobro por hora ---

    // Tarifa fijada por el Administrador desde el Portal Web (pendiente de
    // integración con el backend); por ahora es una constante local.
    const val TARIFA_PARQUEADERO_POR_HORA = 5000.0

    val reservasParqueaderoPorIngresar = listOf(
        ReservaParqueaderoOperativa(id = "rpo-1", codigoQr = "HXC-PARK-000301", placa = "ABC123", prepagada = false),
        ReservaParqueaderoOperativa(id = "rpo-2", codigoQr = "HXC-PARK-000302", placa = "XYZ987", prepagada = true)
    )

    val espaciosDisponiblesParaAsignar = listOf("A-08", "A-09", "B-05")

    // Vehículo que ya lleva un rato adentro, para poder mostrar el cálculo de
    // cobro por hora al registrar su salida sin esperar tiempo real.
    val vehiculosEnParqueadero = listOf(
        ReservaParqueaderoOperativa(
            id = "rpo-3",
            codigoQr = "HXC-PARK-000150",
            placa = "JKL456",
            prepagada = false,
            espacioAsignado = "A-07",
            horaIngreso = LocalTime.now().minusHours(2).minusMinutes(15)
        )
    )

    // --- Cargo: Restaurante — validación de pedidos ---

    val pedidosPorValidar = listOf(
        Pedido(
            id = "ped-3",
            establecimiento = "Food Truck La Sazón",
            items = listOf("1x Perro caliente"),
            total = 18000.0,
            estado = EstadoPedido.PENDIENTE_PAGO,
            codigoQr = "HXC-PED-000050"
        ),
        Pedido(
            id = "ped-4",
            establecimiento = "Food Truck La Sazón",
            items = listOf("2x Hamburguesa", "1x Gaseosa"),
            total = 58000.0,
            estado = EstadoPedido.LISTO,
            codigoQr = "HXC-PED-000045"
        )
    )

    // --- Todo el personal: incidentes ---

    val incidentes = listOf(
        Incidente(
            id = "inc-1",
            titulo = "Fila desbordada en Puerta Norte",
            descripcion = "Se reforzó con un carril adicional de validación.",
            zona = "Puerta Norte",
            hora = "6:40 p. m."
        )
    )

    // --- Todo el personal (menos Jefe de Personal): instrucciones de emergencia por cargo ---

    val instruccionesEmergencia: Map<Cargo, InstruccionEmergencia> = mapOf(
        Cargo.ENTRADA to InstruccionEmergencia(
            ruta = "Salida Norte",
            puestoPersonal = "Bajo el arco de Puerta Norte",
            protocolo = "Detén el ingreso y guía la salida en calma."
        ),
        Cargo.PARQUEADERO to InstruccionEmergencia(
            ruta = "Vía de Servicio hacia la calle principal",
            puestoPersonal = "Junto a la barrera de salida vehicular",
            protocolo = "Abre las barreras y prioriza la salida peatonal."
        ),
        Cargo.RESTAURANTE to InstruccionEmergencia(
            ruta = "Salida Este",
            puestoPersonal = "Frente al punto de comida, bloqueando el paso",
            protocolo = "Apaga los equipos de gas y despeja el área."
        )
    )

    // --- Cargo: Jefe de Personal — validación de ingreso/salida del personal ---

    val personalDelEvento = listOf(
        PersonalOperativo(id = "per-1", nombre = "Luis Ramírez", cargo = Cargo.ENTRADA, codigoQr = "HXC-STAFF-000010"),
        PersonalOperativo(id = "per-2", nombre = "Marta Gómez", cargo = Cargo.PARQUEADERO, codigoQr = "HXC-STAFF-000011"),
        PersonalOperativo(id = "per-3", nombre = "Carlos Peña", cargo = Cargo.RESTAURANTE, codigoQr = "HXC-STAFF-000012")
    )
}
