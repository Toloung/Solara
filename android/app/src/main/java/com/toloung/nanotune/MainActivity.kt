package com.toloung.nanotune

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.viewmodel.compose.viewModel
import com.toloung.nanotune.ui.NanoTuneApp
import com.toloung.nanotune.ui.NanoTuneViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            NanoTuneTheme {
                val viewModel: NanoTuneViewModel = viewModel(
                    factory = NanoTuneViewModel.factory(applicationContext)
                )
                LaunchedEffect(Unit) {
                    viewModel.connectPlayer(applicationContext)
                }
                NanoTuneApp(viewModel = viewModel)
            }
        }
    }
}

@Composable
private fun NanoTuneTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = androidx.compose.ui.graphics.Color(0xFF79D7FF),
            secondary = androidx.compose.ui.graphics.Color(0xFFB4E4FF),
            background = androidx.compose.ui.graphics.Color(0xFF060913),
            surface = androidx.compose.ui.graphics.Color(0xFF101624),
            surfaceVariant = androidx.compose.ui.graphics.Color(0xFF182033),
            onPrimary = androidx.compose.ui.graphics.Color(0xFF001F2C),
            onBackground = androidx.compose.ui.graphics.Color(0xFFF3FAFF),
            onSurface = androidx.compose.ui.graphics.Color(0xFFF3FAFF),
            onSurfaceVariant = androidx.compose.ui.graphics.Color(0xFFC7D8E8)
        ),
        content = content
    )
}
