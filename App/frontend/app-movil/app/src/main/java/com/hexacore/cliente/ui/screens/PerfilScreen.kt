package com.hexacore.cliente.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.hexacore.cliente.R
import com.hexacore.cliente.data.Usuario
import com.hexacore.cliente.ui.components.Avatar

/**
 * Perfil del usuario: nombre y rol son de solo lectura (los define el
 * sistema), correo, teléfono y foto se pueden cambiar aquí.
 */
@Composable
fun PerfilScreen(
    usuario: Usuario,
    onGuardar: (Usuario) -> Unit,
    modifier: Modifier = Modifier
) {
    var correo by remember(usuario.id) { mutableStateOf(usuario.correo) }
    var telefono by remember(usuario.id) { mutableStateOf(usuario.telefono) }
    var fotoUri by remember(usuario.id) { mutableStateOf(usuario.fotoUri) }
    var guardado by remember { mutableStateOf(false) }

    val seleccionarFoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) fotoUri = uri.toString()
    }

    LaunchedEffect(correo, telefono, fotoUri) { guardado = false }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Avatar(nombre = usuario.nombre, fotoUri = fotoUri, tamano = 96.dp)
        OutlinedButton(onClick = {
            seleccionarFoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        }) {
            Text(stringResource(R.string.perfil_boton_cambiar_foto))
        }

        Text(
            text = usuario.nombre,
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(top = 12.dp)
        )

        OutlinedTextField(
            value = correo,
            onValueChange = { correo = it },
            label = { Text(stringResource(R.string.login_correo)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedTextField(
            value = telefono,
            onValueChange = { telefono = it },
            label = { Text(stringResource(R.string.perfil_telefono)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            modifier = Modifier.fillMaxWidth()
        )

        Button(
            onClick = {
                onGuardar(usuario.copy(correo = correo, telefono = telefono, fotoUri = fotoUri))
                guardado = true
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(stringResource(R.string.perfil_boton_guardar))
        }

        if (guardado) {
            Text(text = stringResource(R.string.perfil_guardado), style = MaterialTheme.typography.bodySmall)
        }
    }
}
