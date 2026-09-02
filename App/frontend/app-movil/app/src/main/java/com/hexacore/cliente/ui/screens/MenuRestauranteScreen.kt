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
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.hexacore.cliente.R
import com.hexacore.cliente.data.Establecimiento
import com.hexacore.cliente.data.ItemCarrito
import com.hexacore.cliente.data.MockData
import com.hexacore.cliente.data.ProductoMenu

/**
 * Menú de un establecimiento (CU-011: gestión integral de pedidos). El
 * cliente arma su pedido aquí y pasa a la pasarela de pago cuando termina.
 */
@Composable
fun MenuRestauranteScreen(
    establecimientoId: String,
    carrito: List<ItemCarrito>,
    onAgregar: (ProductoMenu) -> Unit,
    onQuitar: (ProductoMenu) -> Unit,
    onContinuarAlPago: () -> Unit,
    establecimientos: List<Establecimiento> = MockData.establecimientos,
    menuCompleto: List<ProductoMenu> = MockData.menu,
    modifier: Modifier = Modifier
) {
    val establecimiento = establecimientos.firstOrNull { it.id == establecimientoId }
    val productos = menuCompleto.filter { it.establecimientoId == establecimientoId }
    val total = carrito.sumOf { it.producto.precio * it.cantidad }

    Column(modifier = modifier.fillMaxSize()) {
        establecimiento?.let {
            Text(
                text = it.nombre,
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(16.dp)
            )
        }

        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(productos, key = { it.id }) { producto ->
                val cantidad = carrito.firstOrNull { it.producto.id == producto.id }?.cantidad ?: 0
                ProductoCard(
                    producto = producto,
                    cantidad = cantidad,
                    onAgregar = { onAgregar(producto) },
                    onQuitar = { onQuitar(producto) }
                )
            }
        }

        HorizontalDivider()

        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = stringResource(R.string.pedido_total, total),
                style = MaterialTheme.typography.titleMedium
            )
            Button(
                onClick = onContinuarAlPago,
                enabled = carrito.isNotEmpty(),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.menu_boton_continuar_pago))
            }
        }
    }
}

@Composable
private fun ProductoCard(
    producto: ProductoMenu,
    cantidad: Int,
    onAgregar: () -> Unit,
    onQuitar: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(16.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(text = producto.nombre, style = MaterialTheme.typography.titleMedium)
                Text(
                    text = stringResource(R.string.pedido_total, producto.precio),
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            if (!producto.disponible) {
                AssistChip(onClick = {}, label = { Text(stringResource(R.string.menu_no_disponible)) })
            } else if (cantidad == 0) {
                OutlinedButton(onClick = onAgregar) {
                    Text(stringResource(R.string.menu_boton_agregar))
                }
            } else {
                val descripcionQuitar = stringResource(R.string.menu_quitar)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Sin Icons.Default.Remove disponible en material-icons-core: se usa un
                    // "−" de texto, con su descripción accesible puesta a mano.
                    IconButton(
                        onClick = onQuitar,
                        modifier = Modifier.semantics { contentDescription = descripcionQuitar }
                    ) {
                        Text(text = "−", style = MaterialTheme.typography.titleLarge)
                    }
                    Text(text = "$cantidad", style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = onAgregar) {
                        Icon(Icons.Default.Add, contentDescription = stringResource(R.string.menu_agregar))
                    }
                }
            }
        }
    }
}
