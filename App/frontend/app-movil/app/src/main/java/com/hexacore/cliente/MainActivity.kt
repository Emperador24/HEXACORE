package com.hexacore.cliente

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.hexacore.cliente.data.Cargo
import com.hexacore.cliente.data.EstadoPedido
import com.hexacore.cliente.data.ItemCarrito
import com.hexacore.cliente.data.MockData
import com.hexacore.cliente.data.Pedido
import com.hexacore.cliente.data.RolUsuario
import com.hexacore.cliente.data.Usuario
import com.hexacore.cliente.navigation.DestinoCliente
import com.hexacore.cliente.navigation.DestinoPersonal
import com.hexacore.cliente.navigation.destinosPara
import com.hexacore.cliente.ui.components.HexacoreDrawerContent
import com.hexacore.cliente.ui.screens.AjustesScreen
import com.hexacore.cliente.ui.screens.AsistenciaScreen
import com.hexacore.cliente.ui.screens.EmergenciaScreen
import com.hexacore.cliente.ui.screens.EntradasScreen
import com.hexacore.cliente.ui.screens.IncidentesScreen
import com.hexacore.cliente.ui.screens.InicioScreen
import com.hexacore.cliente.ui.screens.LoginScreen
import com.hexacore.cliente.ui.screens.MenuRestauranteScreen
import com.hexacore.cliente.ui.screens.ParqueaderoOperativoScreen
import com.hexacore.cliente.ui.screens.ParqueaderoScreen
import com.hexacore.cliente.ui.screens.PasarelaPagoScreen
import com.hexacore.cliente.ui.screens.PedidosRestauranteScreen
import com.hexacore.cliente.ui.screens.PedidosScreen
import com.hexacore.cliente.ui.screens.PerfilScreen
import com.hexacore.cliente.ui.screens.TurnosScreen
import com.hexacore.cliente.ui.screens.ValidarEntradasScreen
import com.hexacore.cliente.ui.screens.ValidarPersonalScreen
import com.hexacore.cliente.ui.theme.HexacoreClienteTheme
import kotlinx.coroutines.launch

private const val RUTA_LOGIN = "login"
private const val RUTA_CLIENTE = "cliente"
private const val RUTA_PERSONAL = "personal"
private const val RUTA_PERFIL = "perfil"
private const val RUTA_AJUSTES = "ajustes"
private const val RUTA_ENTRADAS_EVENTO = "entradas/{eventoId}"
private const val RUTA_MENU_ESTABLECIMIENTO = "menu/{establecimientoId}"
private const val RUTA_PASARELA_PAGO = "pasarela_pago"

/**
 * Punto de entrada de la app (SAD §8). Un único login identifica el rol
 * (Cliente o Personal — ver [com.hexacore.cliente.data.MockAuth]) y abre el
 * conjunto de pantallas correspondiente dentro de la misma app. Para
 * Personal, el cargo del usuario además decide qué función operativa se
 * activa (ver [destinosPara]). El menú lateral (Perfil/Ajustes) es el mismo
 * para ambos roles.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val temaOscuroDelSistema = isSystemInDarkTheme()
            var modoOscuro by remember { mutableStateOf(temaOscuroDelSistema) }

            HexacoreClienteTheme(darkTheme = modoOscuro) {
                HexacoreApp(modoOscuro = modoOscuro, onModoOscuroChange = { modoOscuro = it })
            }
        }
    }
}

@Composable
fun HexacoreApp(modoOscuro: Boolean, onModoOscuroChange: (Boolean) -> Unit) {
    val navController = rememberNavController()
    var usuarioActual by remember { mutableStateOf<Usuario?>(null) }

    NavHost(navController = navController, startDestination = RUTA_LOGIN) {
        composable(RUTA_LOGIN) {
            LoginScreen(onLoginExitoso = { usuario ->
                usuarioActual = usuario
                val destino = if (usuario.rol == RolUsuario.CLIENTE) RUTA_CLIENTE else RUTA_PERSONAL
                navController.navigate(destino) { popUpTo(RUTA_LOGIN) { inclusive = true } }
            })
        }
        composable(RUTA_CLIENTE) {
            ClienteApp(
                usuario = usuarioActual,
                onActualizarUsuario = { usuarioActual = it },
                modoOscuro = modoOscuro,
                onModoOscuroChange = onModoOscuroChange,
                onCerrarSesion = { navController.cerrarSesion() }
            )
        }
        composable(RUTA_PERSONAL) {
            PersonalApp(
                usuario = usuarioActual,
                onActualizarUsuario = { usuarioActual = it },
                modoOscuro = modoOscuro,
                onModoOscuroChange = onModoOscuroChange,
                onCerrarSesion = { navController.cerrarSesion() }
            )
        }
    }
}

private fun NavHostController.cerrarSesion() {
    navigate(RUTA_LOGIN) { popUpTo(0) }
}

/** Título de Perfil/Ajustes, comunes a ambas apps y fuera de sus tabs. */
private fun tituloPara(ruta: String?): Int? = when (ruta) {
    RUTA_PERFIL -> R.string.drawer_perfil
    RUTA_AJUSTES -> R.string.drawer_ajustes
    else -> null
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ClienteApp(
    usuario: Usuario?,
    onActualizarUsuario: (Usuario) -> Unit,
    modoOscuro: Boolean,
    onModoOscuroChange: (Boolean) -> Unit,
    onCerrarSesion: () -> Unit
) {
    val navController = rememberNavController()
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    // Hoisted aquí (encima de Inicio/Pedidos) para que el carrito sobreviva
    // la navegación entre Restaurantes → Menú → Pasarela de pago, y para que
    // un pedido recién pagado aparezca de inmediato en "Mis pedidos".
    val carrito = remember { mutableStateListOf<ItemCarrito>() }
    val misPedidos = remember { MockData.pedidos.toMutableStateList() }

    val backStackEntry by navController.currentBackStackEntryAsState()
    val rutaActual = backStackEntry?.destination?.route
    val titulo = tituloCliente(rutaActual, backStackEntry?.arguments?.getString("eventoId"), backStackEntry?.arguments?.getString("establecimientoId"))
    val esRutaPrincipal = DestinoCliente.entries.any { it.ruta == rutaActual }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            HexacoreDrawerContent(
                usuario = usuario,
                onPerfil = { scope.launch { drawerState.close() }; navController.navigate(RUTA_PERFIL) },
                onAjustes = { scope.launch { drawerState.close() }; navController.navigate(RUTA_AJUSTES) },
                onCerrarSesion = onCerrarSesion
            )
        }
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(titulo) },
                    navigationIcon = {
                        TopBarNavIcon(
                            esRutaPrincipal = esRutaPrincipal,
                            onAbrirMenu = { scope.launch { drawerState.open() } },
                            onRegresar = { navController.popBackStack() }
                        )
                    }
                )
            },
            bottomBar = { ClienteBottomBar(navController) }
        ) { innerPadding ->
            NavHost(
                navController = navController,
                startDestination = DestinoCliente.INICIO.ruta,
                modifier = Modifier.padding(innerPadding)
            ) {
                composable(DestinoCliente.INICIO.ruta) {
                    InicioScreen(onEventoClick = { evento -> navController.navigate("entradas/${evento.id}") })
                }
                composable(DestinoCliente.PARQUEADERO.ruta) { ParqueaderoScreen() }
                composable(DestinoCliente.PEDIDOS.ruta) {
                    PedidosScreen(
                        pedidos = misPedidos,
                        onEstablecimientoClick = { establecimiento -> navController.navigate("menu/${establecimiento.id}") }
                    )
                }
                composable(
                    route = RUTA_ENTRADAS_EVENTO,
                    arguments = listOf(navArgument("eventoId") { type = NavType.StringType })
                ) { entry ->
                    EntradasScreen(
                        eventoId = entry.arguments?.getString("eventoId") ?: "",
                        nombreRemitente = usuario?.nombre.orEmpty()
                    )
                }
                composable(
                    route = RUTA_MENU_ESTABLECIMIENTO,
                    arguments = listOf(navArgument("establecimientoId") { type = NavType.StringType })
                ) { entry ->
                    val establecimientoId = entry.arguments?.getString("establecimientoId") ?: ""
                    MenuRestauranteScreen(
                        establecimientoId = establecimientoId,
                        carrito = carrito,
                        onAgregar = { producto ->
                            val i = carrito.indexOfFirst { it.producto.id == producto.id }
                            if (i >= 0) carrito[i] = carrito[i].copy(cantidad = carrito[i].cantidad + 1)
                            else carrito.add(ItemCarrito(producto, 1))
                        },
                        onQuitar = { producto ->
                            val i = carrito.indexOfFirst { it.producto.id == producto.id }
                            if (i >= 0) {
                                val actual = carrito[i]
                                if (actual.cantidad <= 1) carrito.removeAt(i) else carrito[i] = actual.copy(cantidad = actual.cantidad - 1)
                            }
                        },
                        onContinuarAlPago = { navController.navigate(RUTA_PASARELA_PAGO) }
                    )
                }
                composable(RUTA_PASARELA_PAGO) {
                    PasarelaPagoScreen(
                        carrito = carrito,
                        onConfirmarPago = {
                            if (carrito.isNotEmpty()) {
                                val nombreEstablecimiento = MockData.establecimientos
                                    .firstOrNull { it.id == carrito.first().producto.establecimientoId }
                                    ?.nombre.orEmpty()
                                val total = carrito.sumOf { it.producto.precio * it.cantidad }
                                misPedidos.add(
                                    0,
                                    Pedido(
                                        id = "ped-${System.currentTimeMillis()}",
                                        establecimiento = nombreEstablecimiento,
                                        items = carrito.map { "${it.cantidad}x ${it.producto.nombre}" },
                                        total = total,
                                        estado = EstadoPedido.EN_PREPARACION,
                                        codigoQr = "HXC-PED-${(100000..999999).random()}"
                                    )
                                )
                                carrito.clear()
                            }
                            navController.navigate(DestinoCliente.PEDIDOS.ruta) {
                                popUpTo(DestinoCliente.INICIO.ruta)
                            }
                        }
                    )
                }
                composable(RUTA_PERFIL) {
                    usuario?.let { PerfilScreen(usuario = it, onGuardar = onActualizarUsuario) }
                }
                composable(RUTA_AJUSTES) {
                    AjustesScreen(
                        modoOscuro = modoOscuro,
                        onModoOscuroChange = onModoOscuroChange,
                        onCerrarSesion = onCerrarSesion
                    )
                }
            }
        }
    }
}

/**
 * Título dinámico de la app Cliente: para las rutas con argumento (una
 * entrada de evento o el menú de un establecimiento) busca el nombre real
 * en los datos mock; para el resto usa las etiquetas fijas de siempre.
 */
@Composable
private fun tituloCliente(ruta: String?, eventoId: String?, establecimientoId: String?): String = when (ruta) {
    RUTA_PERFIL -> stringResource(R.string.drawer_perfil)
    RUTA_AJUSTES -> stringResource(R.string.drawer_ajustes)
    RUTA_ENTRADAS_EVENTO -> MockData.eventos.firstOrNull { it.id == eventoId }?.nombre
        ?: stringResource(DestinoCliente.INICIO.labelResId)
    RUTA_MENU_ESTABLECIMIENTO -> MockData.establecimientos.firstOrNull { it.id == establecimientoId }?.nombre
        ?: stringResource(R.string.pedidos_tab_restaurantes)
    RUTA_PASARELA_PAGO -> stringResource(R.string.pago_resumen_titulo)
    else -> DestinoCliente.entries.firstOrNull { it.ruta == ruta }?.let { stringResource(it.labelResId) }
        ?: stringResource(DestinoCliente.INICIO.labelResId)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PersonalApp(
    usuario: Usuario?,
    onActualizarUsuario: (Usuario) -> Unit,
    modoOscuro: Boolean,
    onModoOscuroChange: (Boolean) -> Unit,
    onCerrarSesion: () -> Unit
) {
    val navController = rememberNavController()
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val cargo = usuario?.cargo
    val destinos = remember(cargo) { destinosPara(cargo) }
    val inicio = destinos.first()
    val rutaActual = navController.currentBackStackEntryAsState().value?.destination?.route
    val tituloResId = tituloPara(rutaActual)
        ?: destinos.firstOrNull { it.ruta == rutaActual }?.labelResId
        ?: inicio.labelResId
    val esRutaPrincipal = destinos.any { it.ruta == rutaActual }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            HexacoreDrawerContent(
                usuario = usuario,
                onPerfil = { scope.launch { drawerState.close() }; navController.navigate(RUTA_PERFIL) },
                onAjustes = { scope.launch { drawerState.close() }; navController.navigate(RUTA_AJUSTES) },
                onCerrarSesion = onCerrarSesion
            )
        }
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(stringResource(tituloResId)) },
                    navigationIcon = {
                        TopBarNavIcon(
                            esRutaPrincipal = esRutaPrincipal,
                            onAbrirMenu = { scope.launch { drawerState.open() } },
                            onRegresar = { navController.popBackStack() }
                        )
                    }
                )
            },
            bottomBar = {
                // El Jefe de Personal solo tiene una pantalla: no hace falta barra de tabs.
                if (destinos.size > 1) PersonalBottomBar(navController, destinos)
            }
        ) { innerPadding ->
            NavHost(
                navController = navController,
                startDestination = inicio.ruta,
                modifier = Modifier.padding(innerPadding)
            ) {
                destinos.forEach { destino ->
                    composable(destino.ruta) {
                        when (destino) {
                            DestinoPersonal.TURNOS -> TurnosScreen()
                            DestinoPersonal.ASISTENCIA -> AsistenciaScreen()
                            DestinoPersonal.VALIDAR_ENTRADAS -> ValidarEntradasScreen()
                            DestinoPersonal.PARQUEADERO_OPERATIVO -> ParqueaderoOperativoScreen()
                            DestinoPersonal.PEDIDOS_RESTAURANTE -> PedidosRestauranteScreen()
                            DestinoPersonal.VALIDAR_PERSONAL -> ValidarPersonalScreen()
                            DestinoPersonal.INCIDENTES -> IncidentesScreen()
                            DestinoPersonal.EMERGENCIA -> EmergenciaScreen(cargo = cargo)
                        }
                    }
                }
                composable(RUTA_PERFIL) {
                    usuario?.let { PerfilScreen(usuario = it, onGuardar = onActualizarUsuario) }
                }
                composable(RUTA_AJUSTES) {
                    AjustesScreen(
                        modoOscuro = modoOscuro,
                        onModoOscuroChange = onModoOscuroChange,
                        onCerrarSesion = onCerrarSesion
                    )
                }
            }
        }
    }
}

/**
 * Icono de navegación del TopAppBar: el menú hamburguesa (abre el drawer) en
 * las pantallas principales de cada tab, y una flecha para regresar en las
 * pantallas a las que se llega navegando más adentro (entradas de un evento,
 * menú de un restaurante, pasarela de pago, Perfil, Ajustes).
 */
@Composable
private fun TopBarNavIcon(esRutaPrincipal: Boolean, onAbrirMenu: () -> Unit, onRegresar: () -> Unit) {
    if (esRutaPrincipal) {
        MenuButton(onClick = onAbrirMenu)
    } else {
        IconButton(onClick = onRegresar) {
            Icon(imageVector = Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.regresar))
        }
    }
}

@Composable
private fun MenuButton(onClick: () -> Unit) {
    IconButton(onClick = onClick) {
        Icon(imageVector = Icons.Default.Menu, contentDescription = stringResource(R.string.abrir_menu))
    }
}

@Composable
private fun ClienteBottomBar(navController: NavHostController) {
    val rutaActual = navController.currentBackStackEntryAsState().value?.destination?.route
    NavigationBar {
        DestinoCliente.entries.forEach { destino ->
            NavigationBarItem(
                selected = rutaActual == destino.ruta,
                onClick = { navController.navegarATab(destino.ruta) },
                icon = { Icon(imageVector = destino.icono, contentDescription = null) },
                label = { Text(stringResource(destino.labelResId)) }
            )
        }
    }
}

@Composable
private fun PersonalBottomBar(navController: NavHostController, destinos: List<DestinoPersonal>) {
    val rutaActual = navController.currentBackStackEntryAsState().value?.destination?.route
    NavigationBar {
        destinos.forEach { destino ->
            NavigationBarItem(
                selected = rutaActual == destino.ruta,
                onClick = { navController.navegarATab(destino.ruta) },
                icon = { Icon(imageVector = destino.icono, contentDescription = null) },
                label = { Text(stringResource(destino.labelResId)) }
            )
        }
    }
}

private fun NavHostController.navegarATab(ruta: String) {
    navigate(ruta) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
