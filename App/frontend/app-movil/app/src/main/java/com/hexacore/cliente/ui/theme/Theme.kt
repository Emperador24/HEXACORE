package com.hexacore.cliente.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

// Paleta estándar de Material 3 (sin personalizar) — placeholder deliberado
// hasta que se definan los colores de marca de HEXACORE.
private val LightColors = lightColorScheme()
private val DarkColors = darkColorScheme()

@Composable
fun HexacoreClienteTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColors else LightColors
    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
