package com.hexacore.cliente.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val HexacorePrimary = Color(0xFF1B1F3B)
private val HexacoreSecondary = Color(0xFF4C5FD5)

private val LightColors = lightColorScheme(
    primary = HexacorePrimary,
    secondary = HexacoreSecondary
)

private val DarkColors = darkColorScheme(
    primary = HexacoreSecondary,
    secondary = HexacorePrimary
)

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
