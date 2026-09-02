package com.hexacore.cliente.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.hexacore.cliente.R
import com.hexacore.cliente.data.MockData
import com.hexacore.cliente.data.ReservaParqueaderoOperativa
import java.time.Duration
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import kotlin.math.ceil

private val FORMATO_HORA: DateTimeFormatter = DateTimeFormatter.ofPattern("h:mm a")

/**
 * Ingreso y salida de vehículos (cargo Parqueadero). Al ingresar, el
 * personal asigna un puesto libre; al salir, se calcula el cobro por hora
 * salvo que la reserva ya viniera prepagada desde que se hizo (CU-021..025).
 */
@Composable
fun ParqueaderoOperativoScreen(
    porIngresar: List<ReservaParqueaderoOperativa> = MockData.reservasParqueaderoPorIngresar,
    enParqueadero: List<ReservaParqueaderoOperativa> = MockData.vehiculosEnParqueadero,
    espaciosDisponibles: List<String> = MockData.espaciosDisponiblesParaAsignar,
    modifier: Modifier = Modifier
) {
    val ingresar = remember(porIngresar) { porIngresar.toMutableStateList() }
    val adentro = remember(enParqueadero) { enParqueadero.toMutableStateList() }
    val libres = remember(espaciosDisponibles) { espaciosDisponibles.toMutableStateList() }

    LazyColumn(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text(stringResource(R.string.parqueadero_por_ingresar), style = MaterialTheme.typography.titleMedium)
        }
        items(ingresar, key = { it.id }) { reserva ->
            ReservaPorIngresarCard(
                reserva = reserva,
                espacioSugerido = libres.firstOrNull(),
                onAsignar = {
                    val espacio = libres.firstOrNull()
                    if (espacio != null) {
                        libres.removeAt(0)
                        ingresar.remove(reserva)
                        adentro.add(reserva.copy(espacioAsignado = espacio, horaIngreso = LocalTime.now()))
                    }
                }
            )
        }

        item {
            HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
            Text(stringResource(R.string.parqueadero_en_lote), style = MaterialTheme.typography.titleMedium)
        }
        items(adentro, key = { it.id }) { reserva ->
            VehiculoEnLoteCard(
                reserva = reserva,
                onRegistrarSalida = {
                    val indice = adentro.indexOfFirst { it.id == reserva.id }
                    if (indice >= 0) adentro[indice] = reserva.copy(horaSalida = LocalTime.now())
                }
            )
        }
    }
}

@Composable
private fun ReservaPorIngresarCard(
    reserva: ReservaParqueaderoOperativa,
    espacioSugerido: String?,
    onAsignar: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(text = reserva.placa, style = MaterialTheme.typography.titleMedium)
            Text(text = reserva.codigoQr, style = MaterialTheme.typography.labelSmall)
            AssistChip(
                onClick = {},
                label = { Text(stringResource(if (reserva.prepagada) R.string.pago_prepagado else R.string.pago_pendiente)) }
            )
            Button(onClick = onAsignar, enabled = espacioSugerido != null, modifier = Modifier.fillMaxWidth()) {
                Text(
                    if (espacioSugerido != null) {
                        stringResource(R.string.parqueadero_boton_asignar, espacioSugerido)
                    } else {
                        stringResource(R.string.parqueadero_sin_espacios)
                    }
                )
            }
        }
    }
}

@Composable
private fun VehiculoEnLoteCard(
    reserva: ReservaParqueaderoOperativa,
    onRegistrarSalida: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(text = "${reserva.placa} · ${reserva.espacioAsignado}", style = MaterialTheme.typography.titleMedium)
            reserva.horaIngreso?.let {
                Text(text = stringResource(R.string.parqueadero_hora_ingreso, it.format(FORMATO_HORA)), style = MaterialTheme.typography.bodyMedium)
            }

            val horaSalida = reserva.horaSalida
            if (horaSalida == null) {
                Button(onClick = onRegistrarSalida, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.parqueadero_boton_salida))
                }
            } else {
                Text(text = stringResource(R.string.parqueadero_hora_salida, horaSalida.format(FORMATO_HORA)), style = MaterialTheme.typography.bodyMedium)
                if (reserva.prepagada) {
                    AssistChip(
                        onClick = {},
                        label = { Text(stringResource(R.string.pago_prepagado)) },
                        colors = AssistChipDefaults.assistChipColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                    )
                } else {
                    val ingreso = reserva.horaIngreso
                    if (ingreso != null) {
                        // LocalTime no tiene fecha: si el turno cruza medianoche la resta da
                        // negativo, así que se corrige sumando un día completo de minutos.
                        val minutos = Duration.between(ingreso, horaSalida).toMinutes().let { if (it < 0) it + 24 * 60 else it }
                        val horas = ceil(minutos / 60.0).toInt().coerceAtLeast(1)
                        val total = horas * MockData.TARIFA_PARQUEADERO_POR_HORA
                        Text(
                            text = stringResource(R.string.parqueadero_cobro, horas, total),
                            style = MaterialTheme.typography.titleMedium
                        )
                    }
                }
            }
        }
    }
}
