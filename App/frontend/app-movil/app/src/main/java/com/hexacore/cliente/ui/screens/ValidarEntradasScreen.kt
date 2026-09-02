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
import com.hexacore.cliente.data.EntradaPorValidar
import com.hexacore.cliente.data.MockData
import com.hexacore.cliente.ui.components.EscanearQrCard

/**
 * Validación de boletas en la puerta (cargo Entrada). El personal lee el QR
 * de cada boleta (una a la vez) y ahí aparece toda su información con la
 * opción de validar el ingreso — sin lista previa de todas las entradas.
 */
@Composable
fun ValidarEntradasScreen(
    entradas: List<EntradaPorValidar> = MockData.entradasPorValidar,
    modifier: Modifier = Modifier
) {
    val lista = remember(entradas) { entradas.toMutableStateList() }
    var indiceEscaneo by remember { mutableIntStateOf(0) }
    var escaneadaId by remember { mutableStateOf<String?>(null) }

    Box(modifier = modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.TopCenter) {
        val escaneada = lista.firstOrNull { it.id == escaneadaId }

        if (escaneada == null) {
            EscanearQrCard(
                instruccion = stringResource(R.string.entrada_escanea_instruccion),
                textoBoton = stringResource(R.string.entrada_boton_escanear),
                onEscanear = {
                    if (lista.isNotEmpty()) {
                        escaneadaId = lista[indiceEscaneo % lista.size].id
                        indiceEscaneo++
                    }
                }
            )
        } else {
            EntradaEscaneadaCard(
                entrada = escaneada,
                onValidar = {
                    val i = lista.indexOfFirst { it.id == escaneada.id }
                    if (i >= 0) lista[i] = escaneada.copy(validada = true)
                },
                onEscanearOtra = { escaneadaId = null }
            )
        }
    }
}

@Composable
private fun EntradaEscaneadaCard(
    entrada: EntradaPorValidar,
    onValidar: () -> Unit,
    onEscanearOtra: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(text = entrada.eventoNombre, style = MaterialTheme.typography.titleLarge)
            Text(text = entrada.zona, style = MaterialTheme.typography.bodyMedium)
            Text(text = entrada.codigoQr, style = MaterialTheme.typography.labelSmall)

            if (entrada.validada) {
                AssistChip(
                    onClick = {},
                    label = { Text(stringResource(R.string.validar_estado_ok)) },
                    colors = AssistChipDefaults.assistChipColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                )
            } else {
                Button(onClick = onValidar, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.entrada_boton_validar))
                }
            }

            OutlinedButton(onClick = onEscanearOtra, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.entrada_boton_escanear_otra))
            }
        }
    }
}
