package com.hexacore.cliente.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Placeholder visual del QR que recibe el cliente una vez algo queda pagado
 * (entrada, pedido o reserva de parqueadero — SAD §2/§4). La generación real
 * del código llega con la integración al backend; por ahora solo representa
 * que existe y muestra su identificador de texto.
 */
@Composable
fun QrPlaceholder(codigo: String, modifier: Modifier = Modifier) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = modifier) {
        Box(
            modifier = Modifier
                .size(72.dp)
                .padding(top = 4.dp)
                .border(BorderStroke(1.dp, MaterialTheme.colorScheme.outline)),
            contentAlignment = Alignment.Center
        ) {
            Text(text = "QR", style = MaterialTheme.typography.titleMedium)
        }
        Text(text = codigo, style = MaterialTheme.typography.labelMedium)
    }
}
