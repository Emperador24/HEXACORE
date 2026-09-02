package com.hexacore.cliente.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.hexacore.cliente.R
import com.hexacore.cliente.data.Incidente
import com.hexacore.cliente.data.MockData
import java.time.LocalTime
import java.time.format.DateTimeFormatter

private val FORMATO_HORA: DateTimeFormatter = DateTimeFormatter.ofPattern("h:mm a")

/**
 * Reporte de incidentes durante el turno, disponible para todo el personal
 * salvo Jefe de Personal (CU-016..CU-020, seguimiento operativo del evento).
 */
@Composable
fun IncidentesScreen(
    incidentesIniciales: List<Incidente> = MockData.incidentes,
    modifier: Modifier = Modifier
) {
    val incidentes = remember(incidentesIniciales) { incidentesIniciales.toMutableStateList() }
    var titulo by remember { mutableStateOf("") }
    var descripcion by remember { mutableStateOf("") }

    LazyColumn(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(stringResource(R.string.incidente_nuevo_titulo), style = MaterialTheme.typography.titleMedium)
                    OutlinedTextField(
                        value = titulo,
                        onValueChange = { titulo = it },
                        label = { Text(stringResource(R.string.incidente_campo_titulo)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = descripcion,
                        onValueChange = { descripcion = it },
                        label = { Text(stringResource(R.string.incidente_campo_descripcion)) },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Button(
                        onClick = {
                            if (titulo.isNotBlank()) {
                                incidentes.add(
                                    0,
                                    Incidente(
                                        id = "inc-${System.currentTimeMillis()}",
                                        titulo = titulo,
                                        descripcion = descripcion,
                                        zona = "—",
                                        hora = LocalTime.now().format(FORMATO_HORA)
                                    )
                                )
                                titulo = ""
                                descripcion = ""
                            }
                        },
                        enabled = titulo.isNotBlank(),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(stringResource(R.string.incidente_boton_reportar))
                    }
                }
            }
        }

        item {
            HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
            Text(stringResource(R.string.incidente_reportados_titulo), style = MaterialTheme.typography.titleMedium)
        }

        items(incidentes, key = { it.id }) { incidente ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(text = incidente.titulo, style = MaterialTheme.typography.titleMedium)
                    if (incidente.descripcion.isNotBlank()) {
                        Text(text = incidente.descripcion, style = MaterialTheme.typography.bodyMedium)
                    }
                    Text(text = incidente.hora, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}
