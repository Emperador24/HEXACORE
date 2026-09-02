package com.hexacore.cliente.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Warning
import androidx.compose.ui.graphics.vector.ImageVector
import com.hexacore.cliente.R
import com.hexacore.cliente.data.Cargo

/**
 * Las tres secciones del rol Cliente (SAD §2, responsabilidades del
 * contenedor App Móvil Cliente): eventos (con acceso a sus entradas),
 * parqueadero y pedidos. "Entradas" ya no es una pestaña propia — se llega
 * a ella desde el evento correspondiente en Inicio.
 */
enum class DestinoCliente(
    val ruta: String,
    val labelResId: Int,
    val icono: ImageVector
) {
    INICIO("inicio", R.string.nav_inicio, Icons.Default.Home),
    PARQUEADERO("parqueadero", R.string.nav_parqueadero, Icons.Default.LocationOn),
    PEDIDOS("pedidos", R.string.nav_pedidos, Icons.Default.ShoppingCart)
}

/**
 * Secciones del rol Personal/Empleado (SAD §2/§4: Personal, Turno,
 * RegistroAsistencia — CU-016..CU-020). Turnos, Asistencia, Incidentes y
 * Emergencia son comunes a todo el personal; el resto se activa según el
 * [Cargo] del usuario autenticado — ver [destinosPara].
 */
enum class DestinoPersonal(
    val ruta: String,
    val labelResId: Int,
    val icono: ImageVector
) {
    TURNOS("turnos", R.string.nav_turnos, Icons.Default.Person),
    ASISTENCIA("asistencia", R.string.nav_asistencia, Icons.Default.CheckCircle),
    VALIDAR_ENTRADAS("validar_entradas", R.string.nav_validar_entradas, Icons.AutoMirrored.Filled.List),
    PARQUEADERO_OPERATIVO("parqueadero_operativo", R.string.nav_parqueadero, Icons.Default.LocationOn),
    PEDIDOS_RESTAURANTE("pedidos_restaurante", R.string.nav_pedidos, Icons.Default.ShoppingCart),
    VALIDAR_PERSONAL("validar_personal", R.string.nav_validar_personal, Icons.Default.Person),
    INCIDENTES("incidentes", R.string.nav_incidentes, Icons.Default.Edit),
    EMERGENCIA("emergencia", R.string.nav_emergencia, Icons.Default.Warning)
}

/**
 * El Jefe de Personal solo tiene la validación de ingreso/salida del
 * personal; los demás cargos comparten Turnos/Asistencia/Incidentes/
 * Emergencia más su función operativa específica.
 */
fun destinosPara(cargo: Cargo?): List<DestinoPersonal> {
    if (cargo == Cargo.JEFE_PERSONAL) return listOf(DestinoPersonal.VALIDAR_PERSONAL)

    val especifico = when (cargo) {
        Cargo.ENTRADA -> DestinoPersonal.VALIDAR_ENTRADAS
        Cargo.PARQUEADERO -> DestinoPersonal.PARQUEADERO_OPERATIVO
        Cargo.RESTAURANTE -> DestinoPersonal.PEDIDOS_RESTAURANTE
        else -> null
    }

    return listOfNotNull(
        DestinoPersonal.TURNOS,
        DestinoPersonal.ASISTENCIA,
        especifico,
        DestinoPersonal.INCIDENTES,
        DestinoPersonal.EMERGENCIA
    )
}
