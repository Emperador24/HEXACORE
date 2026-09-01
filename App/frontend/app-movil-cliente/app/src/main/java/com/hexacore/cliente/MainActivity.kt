package com.hexacore.cliente

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import com.hexacore.cliente.ui.theme.HexacoreClienteTheme

/**
 * Punto de entrada de la App Móvil Cliente (SAD §8).
 * Placeholder de Entrega 2: valida que el pipeline Kotlin + Jetpack Compose
 * compila y corre en el emulador. La funcionalidad real (compra/reventa de
 * entradas, QR de ingreso, parqueadero, pedidos) se construye sobre esta base.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            HexacoreClienteTheme {
                Scaffold { innerPadding ->
                    GreetingScreen(modifier = Modifier.padding(innerPadding))
                }
            }
        }
    }
}

@Composable
fun GreetingScreen(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(text = stringResource(id = R.string.greeting))
    }
}

@Preview(showBackground = true)
@Composable
fun GreetingScreenPreview() {
    HexacoreClienteTheme {
        GreetingScreen()
    }
}
