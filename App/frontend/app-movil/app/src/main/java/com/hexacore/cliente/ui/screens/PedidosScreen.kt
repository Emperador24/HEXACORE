package com.hexacore.cliente.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Tab
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.hexacore.cliente.R
import com.hexacore.cliente.data.Establecimiento
import com.hexacore.cliente.data.Pedido

/**
 * Pedidos del cliente (CU-011..CU-015): "Restaurantes" para armar uno nuevo
 * y "Mis pedidos" para ver el estado/QR de los ya hechos.
 */
@Composable
fun PedidosScreen(
    pedidos: List<Pedido>,
    onEstablecimientoClick: (Establecimiento) -> Unit,
    modifier: Modifier = Modifier
) {
    var pestanaSeleccionada by remember { mutableIntStateOf(0) }

    Column(modifier = modifier.fillMaxSize()) {
        PrimaryTabRow(selectedTabIndex = pestanaSeleccionada) {
            Tab(
                selected = pestanaSeleccionada == 0,
                onClick = { pestanaSeleccionada = 0 },
                text = { Text(stringResource(R.string.pedidos_tab_restaurantes)) }
            )
            Tab(
                selected = pestanaSeleccionada == 1,
                onClick = { pestanaSeleccionada = 1 },
                text = { Text(stringResource(R.string.pedidos_tab_mis_pedidos)) }
            )
        }

        if (pestanaSeleccionada == 0) {
            RestaurantesScreen(onEstablecimientoClick = onEstablecimientoClick)
        } else {
            MisPedidosScreen(pedidos = pedidos)
        }
    }
}
