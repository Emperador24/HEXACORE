package com.hexacore.cliente.data

import java.time.LocalTime

/**
 * Modelos básicos del rol Personal/Empleado (SAD §4: Personal, Turno,
 * RegistroAsistencia — CU-016..CU-020). Al igual que los modelos de Cliente,
 * hoy son datos de ejemplo hasta que exista el Servicio de Personal.
 */
data class Turno(
    val id: String,
    val eventoNombre: String,
    val zona: String,
    val fecha: String,
    val horaInicio: String,
    val horaFin: String
)

data class RegistroAsistencia(
    val turnoId: String,
    val horaEntrada: String? = null,
    val horaSalida: String? = null
)

/** Incidente reportado por cualquier miembro del personal durante su turno. */
data class Incidente(
    val id: String,
    val titulo: String,
    val descripcion: String,
    val zona: String,
    val hora: String
)

/**
 * Protocolo de evacuación específico para el cargo de un empleado (CU-010:
 * evacuación ante emergencias), pensado para leerse de un vistazo en la
 * ventana emergente que aparece al activarse una emergencia — ver
 * [com.hexacore.cliente.ui.screens.EmergenciaScreen].
 */
data class InstruccionEmergencia(
    /** Ruta de evacuación a seguir. */
    val ruta: String,
    /** Dónde debe ubicarse este trabajador durante la evacuación. */
    val puestoPersonal: String,
    /** Qué debe hacer, en pocas palabras. */
    val protocolo: String
)

/**
 * Boleta que el personal de entrada valida en la puerta (CU-0xx: ingreso).
 * Reutiliza la forma de [Entrada] del cliente — misma boleta, vista operativa.
 */
data class EntradaPorValidar(
    val id: String,
    val eventoNombre: String,
    val zona: String,
    val codigoQr: String,
    val validada: Boolean = false
)

/**
 * Reserva de parqueadero desde la perspectiva del personal operativo: la
 * escanean al ingreso (asignan puesto) y al registrar la salida, donde se
 * calcula el cobro por hora si no venía prepagada desde la reserva.
 */
data class ReservaParqueaderoOperativa(
    val id: String,
    val codigoQr: String,
    val placa: String,
    val prepagada: Boolean,
    val espacioAsignado: String? = null,
    val horaIngreso: LocalTime? = null,
    val horaSalida: LocalTime? = null
)

/** Miembro del personal que el Jefe de Personal valida al ingreso/salida por QR. */
data class PersonalOperativo(
    val id: String,
    val nombre: String,
    val cargo: Cargo,
    val codigoQr: String,
    val ingresoRegistrado: Boolean = false,
    val salidaRegistrada: Boolean = false
)
