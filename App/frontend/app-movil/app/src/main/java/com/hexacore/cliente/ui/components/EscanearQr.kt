package com.hexacore.cliente.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Estado "listo para escanear": la vista que ve el personal antes de leer
 * un QR (de entrada, de pedido o de carné). Sin lector de cámara real
 * todavía — el botón simula la lectura tomando el siguiente código de la
 * lista mock (ver las pantallas que lo usan).
 */
@Composable
fun EscanearQrCard(instruccion: String, textoBoton: String, onEscanear: () -> Unit, modifier: Modifier = Modifier) {
    Card(modifier = modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(24.dp).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(140.dp)
                    .border(BorderStroke(1.dp, MaterialTheme.colorScheme.outline)),
                contentAlignment = Alignment.Center
            ) {
                Text(text = "QR", style = MaterialTheme.typography.headlineMedium)
            }
            Text(text = instruccion, style = MaterialTheme.typography.bodyMedium)
            Button(onClick = onEscanear, modifier = Modifier.fillMaxWidth()) {
                Text(textoBoton)
            }
        }
    }
}
