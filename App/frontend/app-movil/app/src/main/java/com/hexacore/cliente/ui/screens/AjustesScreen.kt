package com.hexacore.cliente.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.hexacore.cliente.BuildConfig
import com.hexacore.cliente.R

/**
 * Ajustes generales de la app: preferencias, soporte y versión — lo que
 * siempre trae el apartado de "Ajustes"/"Configuración" de cualquier app.
 * El modo oscuro sí queda conectado al tema real; notificaciones e idioma
 * son preferencias locales hasta que exista el backend correspondiente.
 */
@Composable
fun AjustesScreen(
    modoOscuro: Boolean,
    onModoOscuroChange: (Boolean) -> Unit,
    onCerrarSesion: () -> Unit,
    modifier: Modifier = Modifier
) {
    var notificaciones by remember { mutableStateOf(true) }

    LazyColumn(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            SeccionAjustes(titulo = stringResource(R.string.ajustes_preferencias)) {
                FilaSwitch(
                    etiqueta = stringResource(R.string.ajustes_notificaciones),
                    valor = notificaciones,
                    onValorChange = { notificaciones = it }
                )
                HorizontalDivider()
                FilaSwitch(
                    etiqueta = stringResource(R.string.ajustes_modo_oscuro),
                    valor = modoOscuro,
                    onValorChange = onModoOscuroChange
                )
            }
        }

        item {
            SeccionAjustes(titulo = stringResource(R.string.ajustes_soporte)) {
                Text(stringResource(R.string.ajustes_ayuda_texto), style = MaterialTheme.typography.bodyMedium)
            }
        }

        item {
            SeccionAjustes(titulo = stringResource(R.string.ajustes_acerca_de)) {
                Text(
                    text = stringResource(R.string.ajustes_version, BuildConfig.VERSION_NAME),
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(stringResource(R.string.ajustes_equipo), style = MaterialTheme.typography.bodyMedium)
            }
        }

        item {
            OutlinedButton(onClick = onCerrarSesion, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.cerrar_sesion))
            }
        }
    }
}

@Composable
private fun SeccionAjustes(titulo: String, contenido: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(text = titulo, style = MaterialTheme.typography.titleSmall)
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                contenido()
            }
        }
    }
}

@Composable
private fun FilaSwitch(etiqueta: String, valor: Boolean, onValorChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(etiqueta, style = MaterialTheme.typography.bodyLarge)
        Switch(checked = valor, onCheckedChange = onValorChange)
    }
}
