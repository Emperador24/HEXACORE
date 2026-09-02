package com.hexacore.cliente.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.hexacore.cliente.R
import com.hexacore.cliente.data.Evento
import com.hexacore.cliente.data.MockData

/**
 * Eventos del cliente (CU-001..CU-005), separados en Próximos/Pasados. Al
 * seleccionar un evento se entra a ver sus entradas con QR — ver
 * [EntradasScreen], ya no es una pestaña propia.
 */
@Composable
fun InicioScreen(
    eventos: List<Evento> = MockData.eventos,
    onEventoClick: (Evento) -> Unit = {},
    modifier: Modifier = Modifier
) {
    var pestanaSeleccionada by remember { mutableIntStateOf(0) }
    // El evento más reciente va de primero en ambas pestañas.
    val proximos = eventos.filter { !it.pasado }.sortedByDescending { it.fechaOrden }
    val pasados = eventos.filter { it.pasado }.sortedByDescending { it.fechaOrden }
    val visibles = if (pestanaSeleccionada == 0) proximos else pasados

    Column(modifier = modifier.fillMaxSize()) {
        PrimaryTabRow(selectedTabIndex = pestanaSeleccionada) {
            Tab(
                selected = pestanaSeleccionada == 0,
                onClick = { pestanaSeleccionada = 0 },
                text = { Text(stringResource(R.string.inicio_tab_proximos)) }
            )
            Tab(
                selected = pestanaSeleccionada == 1,
                onClick = { pestanaSeleccionada = 1 },
                text = { Text(stringResource(R.string.inicio_tab_pasados)) }
            )
        }

        if (visibles.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(
                        if (pestanaSeleccionada == 0) R.string.inicio_vacio_proximos else R.string.inicio_vacio_pasados
                    )
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxWidth(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(visibles, key = { it.id }) { evento ->
                    EventoCard(evento = evento, onClick = { onEventoClick(evento) })
                }
            }
        }
    }
}

@Composable
private fun EventoCard(evento: Evento, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            EventoPoster(evento)

            Column(modifier = Modifier.padding(vertical = 4.dp)) {
                Text(text = evento.nombre, style = MaterialTheme.typography.titleMedium)
                Text(text = "${evento.fecha} · ${evento.lugar}", style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

// Poster del evento: la imagen la sube el Administrador al crear el evento en
// el Portal Web (Evento.imagenUrl). Si un evento todavía no tiene imagen, se
// usa un bloque con la inicial del nombre como respaldo.
@Composable
private fun EventoPoster(evento: Evento) {
    val forma = Modifier.size(width = 56.dp, height = 72.dp).clip(RoundedCornerShape(8.dp))
    if (evento.imagenUrl != null) {
        AsyncImage(
            model = evento.imagenUrl,
            contentDescription = evento.nombre,
            contentScale = ContentScale.Crop,
            modifier = forma
        )
    } else {
        PosterPlaceholder(nombreEvento = evento.nombre, modifier = forma)
    }
}

@Composable
private fun PosterPlaceholder(nombreEvento: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = nombreEvento.take(1).uppercase(),
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onPrimaryContainer
        )
    }
}
