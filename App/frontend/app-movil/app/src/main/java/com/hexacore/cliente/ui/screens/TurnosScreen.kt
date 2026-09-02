package com.hexacore.cliente.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.hexacore.cliente.R
import com.hexacore.cliente.data.MockData
import com.hexacore.cliente.data.Turno

/** Turnos asignados al empleado (CU-016..CU-020: asignación y turnos). */
@Composable
fun TurnosScreen(
    turnos: List<Turno> = MockData.turnos,
    modifier: Modifier = Modifier
) {
    LazyColumn(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(turnos, key = { it.id }) { turno ->
            TurnoCard(turno)
        }
    }
}

@Composable
private fun TurnoCard(turno: Turno) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(text = turno.eventoNombre, style = MaterialTheme.typography.titleMedium)
            Text(text = turno.zona, style = MaterialTheme.typography.bodyMedium)
            Text(
                text = stringResource(R.string.turno_horario, turno.fecha, turno.horaInicio, turno.horaFin),
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}
