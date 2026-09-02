package com.hexacore.cliente.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.hexacore.cliente.R
import com.hexacore.cliente.data.Usuario

/**
 * Menú lateral estándar (ícono de tres barras): perfil resumido arriba,
 * navegación a Perfil/Ajustes y "Cerrar sesión" abajo — el patrón que trae
 * cualquier app con cuenta de usuario.
 */
@Composable
fun HexacoreDrawerContent(
    usuario: Usuario?,
    onPerfil: () -> Unit,
    onAjustes: () -> Unit,
    onCerrarSesion: () -> Unit
) {
    ModalDrawerSheet {
        // Column explícito (en vez de confiar en el ColumnScope del sheet)
        // para poder usar weight() y empujar "Cerrar sesión" al fondo.
        Column(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.fillMaxWidth().padding(20.dp)) {
                Avatar(nombre = usuario?.nombre.orEmpty(), fotoUri = usuario?.fotoUri, tamano = 56.dp)
                Text(
                    text = usuario?.nombre ?: "",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 12.dp)
                )
                Text(text = usuario?.correo ?: "", style = MaterialTheme.typography.bodySmall)
            }

            HorizontalDivider()

            NavigationDrawerItem(
                label = { Text(stringResource(R.string.drawer_perfil)) },
                selected = false,
                icon = { Icon(Icons.Default.Person, contentDescription = null) },
                onClick = onPerfil,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
            )
            NavigationDrawerItem(
                label = { Text(stringResource(R.string.drawer_ajustes)) },
                selected = false,
                icon = { Icon(Icons.Default.Settings, contentDescription = null) },
                onClick = onAjustes,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
            )

            Spacer(modifier = Modifier.weight(1f))
            HorizontalDivider()

            NavigationDrawerItem(
                label = { Text(stringResource(R.string.cerrar_sesion)) },
                selected = false,
                icon = { Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null) },
                onClick = onCerrarSesion,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
            )
        }
    }
}
