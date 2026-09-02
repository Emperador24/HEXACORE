package com.hexacore.cliente.data

/**
 * Rol del usuario autenticado (SAD §3, roles del sistema). El login es el
 * mismo formulario para todos; el rol es lo que decide qué conjunto de
 * pantallas se muestra después — ver [MockAuth].
 */
enum class RolUsuario { CLIENTE, PERSONAL }

/**
 * Puesto del personal en el evento. Cada cargo activa una función operativa
 * distinta en la App Móvil, además de las comunes a todo el personal
 * (Turnos, Asistencia, Incidentes, Emergencia) — Jefe de Personal es la
 * excepción: solo tiene la validación de ingreso/salida del personal.
 */
enum class Cargo { ENTRADA, PARQUEADERO, RESTAURANTE, JEFE_PERSONAL }

/**
 * @param fotoUri URI (como texto) de la foto de perfil elegida por el
 * usuario desde el selector de imágenes del sistema; null hasta que la
 * cambie — ver [com.hexacore.cliente.ui.screens.PerfilScreen].
 */
data class Usuario(
    val id: String,
    val nombre: String,
    val correo: String,
    val telefono: String = "",
    val rol: RolUsuario,
    val cargo: Cargo? = null,
    val fotoUri: String? = null
)

/**
 * Autenticación con credenciales quemadas (sin backend todavía). Cuando
 * exista el Servicio de Personal/Usuarios (SAD §5) esto se reemplaza por una
 * llamada real al API Gateway que devuelva el usuario, su rol y su cargo.
 *
 * Hay un usuario demo de Personal por cada cargo para poder probar las
 * cuatro variantes de pantallas sin necesidad de un selector de cargo en la UI.
 */
object MockAuth {

    private const val CONTRASENA_DEMO = "1234"

    private val usuarios = listOf(
        Usuario(id = "usr-cliente-1", nombre = "Ana Torres", correo = "cliente@hexacore.com", telefono = "300 123 4567", rol = RolUsuario.CLIENTE),
        Usuario(id = "usr-personal-1", nombre = "Luis Ramírez", correo = "personal@hexacore.com", telefono = "301 234 5678", rol = RolUsuario.PERSONAL, cargo = Cargo.ENTRADA),
        Usuario(id = "usr-personal-2", nombre = "Marta Gómez", correo = "parqueadero@hexacore.com", telefono = "302 345 6789", rol = RolUsuario.PERSONAL, cargo = Cargo.PARQUEADERO),
        Usuario(id = "usr-personal-3", nombre = "Carlos Peña", correo = "restaurante@hexacore.com", telefono = "303 456 7890", rol = RolUsuario.PERSONAL, cargo = Cargo.RESTAURANTE),
        Usuario(id = "usr-personal-4", nombre = "Isabel Rojas", correo = "jefepersonal@hexacore.com", telefono = "304 567 8901", rol = RolUsuario.PERSONAL, cargo = Cargo.JEFE_PERSONAL)
    )

    /** Devuelve el usuario si las credenciales coinciden, o null si no. */
    fun autenticar(correo: String, contrasena: String): Usuario? {
        if (contrasena != CONTRASENA_DEMO) return null
        return usuarios.firstOrNull { it.correo.equals(correo.trim(), ignoreCase = true) }
    }
}
