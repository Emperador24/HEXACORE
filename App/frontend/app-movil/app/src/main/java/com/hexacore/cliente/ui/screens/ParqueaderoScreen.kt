package com.hexacore.cliente.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.hexacore.cliente.R
import com.hexacore.cliente.data.MockData
import com.hexacore.cliente.data.ReservaParqueadero
import com.hexacore.cliente.ui.components.QrPlaceholder
import kotlinx.coroutines.delay
import java.time.Duration
import java.time.LocalTime

/**
 * Reservas de parqueadero del cliente (CU-021..CU-025), mostradas igual que
 * las entradas: una boleta deslizable por reserva, con su QR, un botón
 * "Cómo llegar" que abre el mapa con la ruta, y — una vez el personal
 * registra el ingreso del vehículo — el tiempo parqueado en vivo.
 */
@Composable
fun ParqueaderoScreen(
    reservas: List<ReservaParqueadero> = listOfNotNull(MockData.reservaParqueadero),
    modifier: Modifier = Modifier
) {
    if (reservas.isEmpty()) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(stringResource(R.string.parqueadero_vacio))
        }
        return
    }

    val pagerState = rememberPagerState(pageCount = { reservas.size })

    Column(modifier = modifier.fillMaxSize()) {
        if (reservas.size > 1) {
            PagerHeaderParqueadero(paginaActual = pagerState.currentPage, total = reservas.size)
        }

        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 24.dp)
        ) { pagina ->
            ReservaCard(
                reserva = reservas[pagina],
                modifier = Modifier.padding(vertical = 16.dp, horizontal = 8.dp)
            )
        }
    }
}

@Composable
private fun PagerHeaderParqueadero(paginaActual: Int, total: Int) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text = stringResource(R.string.parqueadero_pagina, paginaActual + 1, total),
            style = MaterialTheme.typography.titleMedium
        )
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            repeat(total) { indice ->
                val activo = indice == paginaActual
                Box(
                    modifier = Modifier
                        .size(if (activo) 10.dp else 8.dp)
                        .clip(CircleShape)
                        .background(
                            if (activo) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.outlineVariant
                        )
                )
            }
        }
    }
}

@Composable
private fun ReservaCard(reserva: ReservaParqueadero, modifier: Modifier = Modifier) {
    val context = LocalContext.current

    Card(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(text = reserva.eventoNombre, style = MaterialTheme.typography.titleLarge)
                Text(text = reserva.lugarEvento, style = MaterialTheme.typography.bodyMedium)
            }

            AssistChip(onClick = {}, label = { Text("${reserva.zona} · ${reserva.espacioId}") })

            OutlinedButton(
                onClick = {
                    val uri = Uri.parse(
                        "https://www.google.com/maps/dir/?api=1&destination=" + Uri.encode(reserva.lugarEvento)
                    )
                    context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.parqueadero_boton_como_llegar))
            }

            HorizontalDivider()

            Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                QrPlaceholder(codigo = reserva.codigoQr)
            }

            HorizontalDivider()

            // El conteo de horas no arranca hasta que el personal de
            // parqueadero valide este QR en la entrada y registre el
            // ingreso del vehículo (ParqueaderoOperativoScreen). Como el
            // ingreso lo registra otro rol y no hay backend real conectando
            // ambas apps, se simula esa validación con un botón de demo.
            var horaIngreso by remember(reserva.id) { mutableStateOf(reserva.horaIngreso) }
            val horaIngresoActual = horaIngreso
            if (horaIngresoActual != null) {
                TiempoParqueadoEnVivo(horaIngresoActual)
            } else {
                EsperandoValidacion(onSimularValidacion = { horaIngreso = LocalTime.now() })
            }
        }
    }
}

@Composable
private fun EsperandoValidacion(onSimularValidacion: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = stringResource(R.string.parqueadero_qr_instruccion),
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center
        )
        Button(onClick = onSimularValidacion) {
            Text(stringResource(R.string.parqueadero_boton_simular_validacion))
        }
    }
}

@Composable
private fun TiempoParqueadoEnVivo(horaIngreso: LocalTime) {
    var ahora by remember { mutableStateOf(LocalTime.now()) }

    LaunchedEffect(horaIngreso) {
        while (true) {
            ahora = LocalTime.now()
            delay(1000)
        }
    }

    // LocalTime no tiene fecha: si el turno cruza medianoche la resta da
    // negativo, así que se corrige sumando un día completo de segundos.
    val totalSegundos = Duration.between(horaIngreso, ahora).seconds.let { if (it < 0) it + 24 * 3600 else it }
    val horas = totalSegundos / 3600
    val minutos = (totalSegundos % 3600) / 60
    val segundos = totalSegundos % 60

    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = stringResource(R.string.parqueadero_llevas_aqui), style = MaterialTheme.typography.labelLarge)
        Text(
            text = stringResource(R.string.parqueadero_tiempo_en_vivo, horas, minutos, segundos),
            style = MaterialTheme.typography.headlineSmall
        )
    }
}
