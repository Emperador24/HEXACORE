package com.hexacore.cliente.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.hexacore.cliente.R
import com.hexacore.cliente.data.EstadoPedido
import com.hexacore.cliente.data.MockData
import com.hexacore.cliente.data.Pedido
import com.hexacore.cliente.ui.components.EscanearQrCard

/**
 * Validación de pedidos en el punto de comida (cargo Restaurante): el
 * personal lee el QR del pedido y ahí aparece toda su información —
 * incluyendo si ya está pagado o hay que cobrarlo (CU-011..CU-015).
 */
@Composable
fun PedidosRestauranteScreen(
    pedidos: List<Pedido> = MockData.pedidosPorValidar,
    modifier: Modifier = Modifier
) {
    val lista = remember(pedidos) { pedidos.toMutableStateList() }
    var indiceEscaneo by remember { mutableIntStateOf(0) }
    var escaneadoId by remember { mutableStateOf<String?>(null) }

    Box(modifier = modifier.fillMaxSize().padding(16.dp)) {
        val escaneado = lista.firstOrNull { it.id == escaneadoId }

        if (escaneado == null) {
            EscanearQrCard(
                instruccion = stringResource(R.string.pedido_escanea_instruccion),
                textoBoton = stringResource(R.string.pedido_boton_escanear),
                onEscanear = {
                    if (lista.isNotEmpty()) {
                        escaneadoId = lista[indiceEscaneo % lista.size].id
                        indiceEscaneo++
                    }
                }
            )
        } else {
            PedidoEscaneadoCard(
                pedido = escaneado,
                onValidar = {
                    val i = lista.indexOfFirst { it.id == escaneado.id }
                    if (i >= 0) lista[i] = escaneado.copy(estado = EstadoPedido.ENTREGADO)
                },
                onEscanearOtro = { escaneadoId = null }
            )
        }
    }
}

@Composable
private fun PedidoEscaneadoCard(pedido: Pedido, onValidar: () -> Unit, onEscanearOtro: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(text = pedido.establecimiento, style = MaterialTheme.typography.titleLarge)
            Text(text = pedido.items.joinToString(", "), style = MaterialTheme.typography.bodyMedium)
            Text(
                text = stringResource(R.string.pedido_total, pedido.total),
                style = MaterialTheme.typography.bodyMedium
            )
            pedido.codigoQr?.let { Text(text = it, style = MaterialTheme.typography.labelSmall) }

            when (pedido.estado) {
                EstadoPedido.ENTREGADO -> AssistChip(
                    onClick = {},
                    label = { Text(stringResource(R.string.validar_estado_ok)) },
                    colors = AssistChipDefaults.assistChipColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                )
                EstadoPedido.PENDIENTE_PAGO -> {
                    AssistChip(onClick = {}, label = { Text(stringResource(R.string.pago_pendiente)) })
                    Button(onClick = onValidar, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.pedido_boton_cobrar_entregar))
                    }
                }
                else -> {
                    AssistChip(onClick = {}, label = { Text(stringResource(R.string.pago_prepagado)) })
                    Button(onClick = onValidar, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.pedido_boton_validar_entrega))
                    }
                }
            }

            OutlinedButton(onClick = onEscanearOtro, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.pedido_boton_escanear_otro))
            }
        }
    }
}
