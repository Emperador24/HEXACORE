package com.hexacore.cliente.ui.screens

import android.Manifest
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.foundation.layout.height
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.hexacore.cliente.R
import com.hexacore.cliente.data.Entrada
import com.hexacore.cliente.data.EstadoEntrada
import com.hexacore.cliente.data.Evento
import com.hexacore.cliente.data.MockData
import com.hexacore.cliente.notificaciones.NotificacionesEntradas
import com.hexacore.cliente.ui.components.QrPlaceholder

/**
 * Entradas del cliente para un evento puntual (CU-006, CU-009: QR de
 * ingreso y envío de una entrada a otro usuario), a las que se llega
 * tocando ese evento en Inicio — no es una pestaña propia. Presentadas como
 * boletas deslizables, al estilo de apps de boletería como TuBoleta Pass.
 *
 * La reventa no se gestiona desde la app móvil (queda en el Portal Web);
 * aquí la única transferencia posible es enviarle la entrada directamente
 * a otro usuario por su correo, lo que le llega como notificación.
 */
@Composable
fun EntradasScreen(
    eventoId: String,
    entradas: List<Entrada> = MockData.entradas.filter { it.eventoId == eventoId },
    nombreRemitente: String = "",
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val lista = remember(entradas) { entradas.toMutableStateList() }
    var entradaAEnviar by remember { mutableStateOf<Entrada?>(null) }

    // Resueltos aquí (no con context.getString dentro del callback) para que
    // stringResource se recalcule si cambia la configuración — ver lint
    // LocalContextGetResourceValueCall.
    val nombreAppPorDefecto = stringResource(R.string.app_name)
    val plantillaEntradaEnviada = stringResource(R.string.entrada_enviada_confirmacion)

    val lanzadorPermiso = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }

    if (lista.isEmpty()) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(stringResource(R.string.entradas_vacio))
        }
        return
    }

    val pagerState = rememberPagerState(pageCount = { lista.size })

    Column(modifier = modifier.fillMaxSize()) {
        PagerHeader(paginaActual = pagerState.currentPage, total = lista.size)

        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 24.dp)
        ) { pagina ->
            if (pagina < lista.size) {
                val entrada = lista[pagina]
                EntradaCard(
                    entrada = entrada,
                    evento = MockData.eventos.firstOrNull { it.id == entrada.eventoId },
                    onEnviar = { entradaAEnviar = entrada },
                    modifier = Modifier.padding(vertical = 16.dp, horizontal = 8.dp)
                )
            }
        }
    }

    val entradaSeleccionada = entradaAEnviar
    if (entradaSeleccionada != null) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !NotificacionesEntradas.tienePermiso(context)
        ) {
            lanzadorPermiso.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        DialogoEnviarEntrada(
            onCancelar = { entradaAEnviar = null },
            onEnviar = { correo ->
                lista.remove(entradaSeleccionada)
                NotificacionesEntradas.notificarEntradaRecibida(
                    context = context,
                    remitente = nombreRemitente.ifBlank { nombreAppPorDefecto },
                    eventoNombre = entradaSeleccionada.eventoNombre
                )
                Toast.makeText(
                    context,
                    String.format(plantillaEntradaEnviada, correo),
                    Toast.LENGTH_SHORT
                ).show()
                entradaAEnviar = null
            }
        )
    }
}

@Composable
private fun DialogoEnviarEntrada(onCancelar: () -> Unit, onEnviar: (String) -> Unit) {
    var correo by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onCancelar,
        title = { Text(stringResource(R.string.entrada_enviar_titulo)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(stringResource(R.string.entrada_enviar_instruccion))
                OutlinedTextField(
                    value = correo,
                    onValueChange = { correo = it },
                    label = { Text(stringResource(R.string.entrada_enviar_campo_correo)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onEnviar(correo) }, enabled = correo.contains("@")) {
                Text(stringResource(R.string.entrada_enviar_boton_confirmar))
            }
        },
        dismissButton = {
            TextButton(onClick = onCancelar) {
                Text(stringResource(R.string.entrada_enviar_boton_cancelar))
            }
        }
    )
}

@Composable
private fun PagerHeader(paginaActual: Int, total: Int) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text = stringResource(R.string.entrada_pagina, paginaActual + 1, total),
            style = MaterialTheme.typography.titleMedium
        )
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            repeat(total) { indice ->
                val activo = indice == paginaActual
                Box(
                    modifier = Modifier
                        .size(if (activo) 10.dp else 8.dp)
                        .clip(CircleShape)
                        .background(
                            if (activo) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.outlineVariant
                        )
                )
            }
        }
    }
}

@Composable
private fun EntradaCard(entrada: Entrada, evento: Evento?, onEnviar: () -> Unit, modifier: Modifier = Modifier) {
    Card(modifier = modifier.fillMaxWidth()) {
        Column {
            // Poster del evento (Evento.imagenUrl) — lo sube el Administrador
            // al crear el evento en el Portal Web; da contexto visual antes de
            // entrar en el detalle puntual de la boleta.
            if (evento?.imagenUrl != null) {
                AsyncImage(
                    model = evento.imagenUrl,
                    contentDescription = entrada.eventoNombre,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().height(140.dp)
                )
            }

            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(text = entrada.eventoNombre, style = MaterialTheme.typography.titleLarge)
                    Text(text = "${entrada.fecha} · ${entrada.lugar}", style = MaterialTheme.typography.bodyMedium)
                }

                AssistChip(onClick = {}, label = { Text(estadoLabel(entrada.estado)) })

                HorizontalDivider()

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    CampoLocalidad(stringResource(R.string.entrada_zona), entrada.zona)
                    CampoLocalidad(stringResource(R.string.entrada_fila), entrada.fila)
                    CampoLocalidad(stringResource(R.string.entrada_silla), entrada.silla)
                }

                HorizontalDivider()

                // Identificadores únicos de esta boleta y del pago que la
                // generó, para poder rastrear/conciliar cualquier reclamo.
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    FilaDato(stringResource(R.string.entrada_numero_ticket), entrada.numeroTicket)
                    FilaDato(stringResource(R.string.entrada_numero_transaccion), entrada.numeroTransaccion)
                }

                HorizontalDivider()

                Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    QrPlaceholder(codigo = entrada.codigoQr)
                }

                // La reventa se gestiona desde el Portal Web, no desde la app
                // móvil: aquí solo se puede enviar la entrada a otro usuario.
                if (entrada.estado == EstadoEntrada.VALIDA) {
                    Button(onClick = onEnviar, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.entrada_boton_enviar))
                    }
                }
            }
        }
    }
}

@Composable
private fun FilaDato(etiqueta: String, valor: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(
            text = etiqueta,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(text = valor, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun CampoLocalidad(etiqueta: String, valor: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = etiqueta, style = MaterialTheme.typography.labelSmall)
        Text(text = valor, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun estadoLabel(estado: EstadoEntrada): String = when (estado) {
    EstadoEntrada.VALIDA -> stringResource(R.string.entrada_estado_valida)
    EstadoEntrada.EN_REVENTA -> stringResource(R.string.entrada_estado_en_reventa)
    EstadoEntrada.USADA -> stringResource(R.string.entrada_estado_usada)
}
