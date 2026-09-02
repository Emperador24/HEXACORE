package com.hexacore.cliente.ui.components

import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Foto de perfil del usuario si eligió una desde la galería, o su inicial
 * sobre un círculo de color como respaldo — mismo patrón que el "poster" de
 * eventos en [com.hexacore.cliente.ui.screens.InicioScreen].
 */
@Composable
fun Avatar(nombre: String, fotoUri: String?, modifier: Modifier = Modifier, tamano: Dp = 48.dp) {
    val context = LocalContext.current
    var bitmap by remember(fotoUri) { mutableStateOf<Bitmap?>(null) }

    LaunchedEffect(fotoUri) {
        bitmap = fotoUri?.let { uriTexto ->
            runCatching {
                val uri = Uri.parse(uriTexto)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri))
                } else {
                    @Suppress("DEPRECATION")
                    MediaStore.Images.Media.getBitmap(context.contentResolver, uri)
                }
            }.getOrNull()
        }
    }

    Box(
        modifier = modifier
            .size(tamano)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center
    ) {
        val foto = bitmap
        if (foto != null) {
            Image(bitmap = foto.asImageBitmap(), contentDescription = null, modifier = Modifier.size(tamano))
        } else {
            Text(
                text = nombre.trim().firstOrNull()?.uppercase() ?: "?",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
        }
    }
}
