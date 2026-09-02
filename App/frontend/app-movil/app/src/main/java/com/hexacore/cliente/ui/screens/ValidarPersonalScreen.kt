package com.hexacore.cliente.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AssistChip
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
import com.hexacore.cliente.data.MockData
import com.hexacore.cliente.data.PersonalOperativo
import com.hexacore.cliente.ui.components.EscanearQrCard

/**
 * Único cargo con acceso exclusivo: el Jefe de Personal lee el QR del carné
 * de cada empleado (uno a la vez) y ahí mismo aparece si le corresponde
 * validar ingreso o salida — sin lista previa de todo el personal.
 */
@Composable
fun ValidarPersonalScreen(
    personal: List<PersonalOperativo> = MockData.personalDelEvento,
    modifier: Modifier = Modifier
) {
    val lista = remember(personal) { personal.toMutableStateList() }
    var indiceEscaneo by remember { mutableIntStateOf(0) }
    var escaneadoId by remember { mutableStateOf<String?>(null) }

    Box(modifier = modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.TopCenter) {
        val escaneado = lista.firstOrNull { it.id == escaneadoId }

        if (escaneado == null) {
            EscanearQrCard(
                instruccion = stringResource(R.string.personal_escanea_instruccion),
                textoBoton = stringResource(R.string.personal_boton_escanear),
                onEscanear = {
                    if (lista.isNotEmpty()) {
                        escaneadoId = lista[indiceEscaneo % lista.size].id
                        indiceEscaneo++
                    }
                }
            )
        } else {
            PersonalEscaneadoCard(
                empleado = escaneado,
                onValidarIngreso = {
                    val i = lista.indexOfFirst { it.id == escaneado.id }
                    if (i >= 0) lista[i] = escaneado.copy(ingresoRegistrado = true)
                },
                onValidarSalida = {
                    val i = lista.indexOfFirst { it.id == escaneado.id }
                    if (i >= 0) lista[i] = escaneado.copy(salidaRegistrada = true)
                },
                onEscanearOtro = { escaneadoId = null }
            )
        }
    }
}

@Composable
private fun PersonalEscaneadoCard(
    empleado: PersonalOperativo,
    onValidarIngreso: () -> Unit,
    onValidarSalida: () -> Unit,
    onEscanearOtro: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(text = empleado.nombre, style = MaterialTheme.typography.titleLarge)
            Text(text = empleado.codigoQr, style = MaterialTheme.typography.labelSmall)

            when {
                !empleado.ingresoRegistrado -> {
                    AssistChip(onClick = {}, label = { Text(stringResource(R.string.personal_pendiente_ingreso)) })
                    Button(onClick = onValidarIngreso, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.personal_boton_ingreso))
                    }
                }
                !empleado.salidaRegistrada -> {
                    AssistChip(onClick = {}, label = { Text(stringResource(R.string.personal_ingreso_ok)) })
                    Button(onClick = onValidarSalida, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.personal_boton_salida))
                    }
                }
                else -> {
                    AssistChip(onClick = {}, label = { Text(stringResource(R.string.personal_turno_completo)) })
                }
            }

            OutlinedButton(onClick = onEscanearOtro, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.personal_boton_escanear_otro))
            }
        }
    }
}
