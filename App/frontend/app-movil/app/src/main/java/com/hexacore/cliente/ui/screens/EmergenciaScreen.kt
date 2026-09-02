package com.hexacore.cliente.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.hexacore.cliente.data.Cargo
import com.hexacore.cliente.data.InstruccionEmergencia
import com.hexacore.cliente.data.MockData

/**
 * Protocolo de evacuación por cargo (CU-010). Quien activa, coordina y
 * finaliza la evacuación es el Supervisor de Emergencia u Organizador desde
 * el Portal Web Administrativo — no el personal operativo (Entrada,
 * Parqueadero, Restaurante): intentarlo desde su rol sería justamente el
 * camino de excepción CU-010H (activación no autorizada), que el sistema
 * debe rechazar. Este personal solo *recibe* la alerta — en producción, vía
 * notificación push que abre esta ventana automáticamente; aquí, sin ese
 * backend todavía, el botón simula la llegada de esa alerta.
 */
@Composable
fun EmergenciaScreen(
    cargo: Cargo?,
    instrucciones: Map<Cargo, InstruccionEmergencia> = MockData.instruccionesEmergencia,
    modifier: Modifier = Modifier
) {
    var ventanaVisible by remember { mutableStateOf(false) }
    val instruccion = cargo?.let { instrucciones[it] }

    Box(modifier = modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.TopCenter) {
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(24.dp).fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Warning,
                    contentDescription = null,
                    modifier = Modifier.padding(8.dp)
                )
                Text(
                    text = stringResource(R.string.emergencia_inactiva),
                    style = MaterialTheme.typography.bodyMedium
                )
                Button(onClick = { ventanaVisible = true }, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.emergencia_boton_activar))
                }
            }
        }
    }

    if (ventanaVisible) {
        AlertDialog(
            onDismissRequest = { ventanaVisible = false },
            icon = { Icon(Icons.Default.Warning, contentDescription = null) },
            title = { Text(stringResource(R.string.emergencia_titulo)) },
            text = {
                if (instruccion == null) {
                    Text(stringResource(R.string.emergencia_sin_instrucciones))
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        CampoProtocolo(stringResource(R.string.emergencia_ruta), instruccion.ruta)
                        CampoProtocolo(stringResource(R.string.emergencia_tu_puesto), instruccion.puestoPersonal)
                        CampoProtocolo(stringResource(R.string.emergencia_que_hacer), instruccion.protocolo)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { ventanaVisible = false }) {
                    Text(stringResource(R.string.emergencia_boton_entendido))
                }
            }
        )
    }
}

@Composable
private fun CampoProtocolo(etiqueta: String, valor: String) {
    Column {
        Text(text = etiqueta, style = MaterialTheme.typography.labelLarge)
        Text(text = valor, style = MaterialTheme.typography.bodyMedium)
    }
}
