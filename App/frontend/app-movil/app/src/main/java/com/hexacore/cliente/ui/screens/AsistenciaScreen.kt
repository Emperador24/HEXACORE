package com.hexacore.cliente.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
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
import com.hexacore.cliente.R
import com.hexacore.cliente.data.MockData
import com.hexacore.cliente.data.RegistroAsistencia
import com.hexacore.cliente.data.Turno
import java.time.LocalTime
import java.time.format.DateTimeFormatter

private val FORMATO_HORA: DateTimeFormatter = DateTimeFormatter.ofPattern("h:mm a")

/** Registro de entrada/salida del turno del día (CU-016..CU-020: asistencia). */
@Composable
fun AsistenciaScreen(
    turno: Turno? = MockData.turnos.firstOrNull(),
    modifier: Modifier = Modifier
) {
    var registro by remember { mutableStateOf(turno?.let { RegistroAsistencia(turnoId = it.id) }) }

    Box(modifier = modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.TopCenter) {
        if (turno == null) {
            Text(stringResource(R.string.asistencia_sin_turno))
            return@Box
        }

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(text = turno.eventoNombre, style = MaterialTheme.typography.titleLarge)
                Text(text = turno.zona, style = MaterialTheme.typography.bodyMedium)
                Text(
                    text = stringResource(R.string.turno_horario, turno.fecha, turno.horaInicio, turno.horaFin),
                    style = MaterialTheme.typography.bodyMedium
                )

                val reg = registro
                when {
                    reg == null || reg.horaEntrada == null -> {
                        Text(stringResource(R.string.asistencia_sin_registrar))
                        Button(
                            onClick = { registro = RegistroAsistencia(turno.id, horaEntrada = LocalTime.now().format(FORMATO_HORA)) },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(stringResource(R.string.asistencia_boton_entrada))
                        }
                    }
                    reg.horaSalida == null -> {
                        Text(stringResource(R.string.asistencia_en_turno, reg.horaEntrada))
                        Button(
                            onClick = { registro = reg.copy(horaSalida = LocalTime.now().format(FORMATO_HORA)) },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(stringResource(R.string.asistencia_boton_salida))
                        }
                    }
                    else -> {
                        Text(stringResource(R.string.asistencia_finalizada, reg.horaEntrada, reg.horaSalida))
                    }
                }
            }
        }
    }
}
