package com.hexacore.cliente.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.hexacore.cliente.R
import com.hexacore.cliente.data.EstadoPedido
import com.hexacore.cliente.data.MockData
import com.hexacore.cliente.data.Pedido
import com.hexacore.cliente.ui.components.QrPlaceholder

/**
 * Pedidos ya realizados por el cliente (CU-011..CU-015): estado y, una vez
 * pagado, el QR para retirarlo. Sub-pestaña de Pedidos, junto a Restaurantes
 * (donde se arma uno nuevo) — ver [PedidosScreen].
 */
@Composable
fun MisPedidosScreen(
    pedidos: List<Pedido> = MockData.pedidos,
    modifier: Modifier = Modifier
) {
    if (pedidos.isEmpty()) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(stringResource(R.string.pedidos_vacio))
        }
        return
    }

    LazyColumn(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(pedidos, key = { it.id }) { pedido ->
            PedidoCard(pedido)
        }
    }
}

@Composable
private fun PedidoCard(pedido: Pedido) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(text = pedido.establecimiento, style = MaterialTheme.typography.titleMedium)
            Text(text = pedido.items.joinToString(", "), style = MaterialTheme.typography.bodyMedium)
            Text(
                text = stringResource(R.string.pedido_total, pedido.total),
                style = MaterialTheme.typography.bodyMedium
            )
            AssistChip(onClick = {}, label = { Text(estadoLabel(pedido.estado)) })

            if (pedido.estado == EstadoPedido.PENDIENTE_PAGO) {
                // Sin pago confirmado todavía no hay QR de retiro — la acción
                // de pago se conecta cuando exista la pasarela de pagos real.
                Button(onClick = {}) {
                    Text(stringResource(R.string.pedido_boton_pagar))
                }
            } else {
                pedido.codigoQr?.let { QrPlaceholder(codigo = it) }
            }
        }
    }
}

@Composable
private fun estadoLabel(estado: EstadoPedido): String = when (estado) {
    EstadoPedido.PENDIENTE_PAGO -> stringResource(R.string.pedido_estado_pendiente_pago)
    EstadoPedido.EN_PREPARACION -> stringResource(R.string.pedido_estado_en_preparacion)
    EstadoPedido.LISTO -> stringResource(R.string.pedido_estado_listo)
    EstadoPedido.ENTREGADO -> stringResource(R.string.pedido_estado_entregado)
}
