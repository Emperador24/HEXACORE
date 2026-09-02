package com.hexacore.cliente.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
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
import com.hexacore.cliente.data.ItemCarrito

/**
 * Pago del pedido (CU-011). Sin pasarela de pagos real todavía: el cliente
 * elige entre medios de pago ya guardados (nunca se piden datos de tarjeta
 * aquí) y confirma; eso genera el pedido con su QR de retiro.
 */
@Composable
fun PasarelaPagoScreen(
    carrito: List<ItemCarrito>,
    onConfirmarPago: () -> Unit,
    modifier: Modifier = Modifier
) {
    var metodoSeleccionado by remember { mutableStateOf(0) }
    val metodos = listOf(
        stringResource(R.string.pago_metodo_tarjeta),
        stringResource(R.string.pago_metodo_efectivo)
    )
    val total = carrito.sumOf { it.producto.precio * it.cantidad }

    Column(modifier = modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Text(stringResource(R.string.pago_resumen_titulo), style = MaterialTheme.typography.titleMedium)
            }
            items(carrito, key = { it.producto.id }) { item ->
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("${item.cantidad}x ${item.producto.nombre}")
                    Text(stringResource(R.string.pedido_total, item.producto.precio * item.cantidad))
                }
            }

            item {
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                Text(
                    text = stringResource(R.string.pedido_total, total),
                    style = MaterialTheme.typography.titleLarge
                )
            }

            item {
                Text(
                    text = stringResource(R.string.pago_metodo_titulo),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 16.dp)
                )
            }
            items(metodos.size) { indice ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.padding(12.dp).fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = metodoSeleccionado == indice,
                            onClick = { metodoSeleccionado = indice }
                        )
                        Text(metodos[indice])
                    }
                }
            }
        }

        Button(
            onClick = onConfirmarPago,
            modifier = Modifier.fillMaxWidth().padding(16.dp)
        ) {
            Text(stringResource(R.string.pago_boton_confirmar))
        }
    }
}
