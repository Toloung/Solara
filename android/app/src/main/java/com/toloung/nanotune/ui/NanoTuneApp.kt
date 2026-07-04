package com.toloung.nanotune.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.toloung.nanotune.data.LyricLine
import com.toloung.nanotune.data.Song
import kotlin.math.max

@Composable
fun NanoTuneApp(viewModel: NanoTuneViewModel) {
    val state by viewModel.ui.collectAsState()
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFF111A2E), Color(0xFF05070C), Color(0xFF101625))
                )
            )
            .padding(18.dp)
    ) {
        if (!state.isLoggedIn) {
            LoginScreen(state = state, onBaseUrl = viewModel::updateBaseUrl, onLogin = viewModel::login)
        } else {
            PlayerHome(state = state, viewModel = viewModel)
        }
        if (state.isBusy) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.TopEnd))
        }
    }
}

@Composable
private fun LoginScreen(
    state: NanoTuneUiState,
    onBaseUrl: (String) -> Unit,
    onLogin: (String) -> Unit
) {
    var password by remember { mutableStateOf("") }
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center
    ) {
        Text("NanoTune", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Black)
        Text("原生播放器", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(28.dp))
        OutlinedTextField(
            value = state.baseUrl,
            onValueChange = onBaseUrl,
            label = { Text("服务器地址") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("登录密码") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(16.dp))
        Button(onClick = { onLogin(password) }, modifier = Modifier.fillMaxWidth()) {
            Text("登录")
        }
        state.error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun PlayerHome(state: NanoTuneUiState, viewModel: NanoTuneViewModel) {
    var query by remember { mutableStateOf(state.query) }
    var tab by remember { mutableIntStateOf(0) }
    Column(modifier = Modifier.fillMaxSize()) {
        Text("NanoTune", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Black)
        Text("搜索、播放和收藏都在原生界面里完成", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                label = { Text("搜索歌曲或歌手") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            Spacer(Modifier.width(10.dp))
            IconButton(onClick = { viewModel.search(query) }) {
                Icon(Icons.Rounded.Search, contentDescription = "搜索")
            }
        }
        state.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(14.dp))
        NowPlayingCard(state = state, viewModel = viewModel)
        Spacer(Modifier.height(14.dp))
        TabRow(selectedTabIndex = tab) {
            listOf("搜索", "队列", "收藏").forEachIndexed { index, title ->
                Tab(selected = tab == index, onClick = { tab = index }, text = { Text(title) })
            }
        }
        val songs = when (tab) {
            1 -> state.queue
            2 -> state.favorites
            else -> state.results
        }
        LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (tab == 1 && songs.isNotEmpty()) {
                item {
                    AssistChip(onClick = viewModel::clearQueue, label = { Text("清空队列") })
                }
            }
            items(songs, key = { it.id + it.apiPath }) { song ->
                SongRow(
                    song = song,
                    isFavorite = state.favorites.any { it.id == song.id },
                    onPlay = { viewModel.play(song) },
                    onFavorite = { viewModel.toggleFavorite(song) }
                )
            }
        }
    }
}

@Composable
private fun NowPlayingCard(state: NanoTuneUiState, viewModel: NanoTuneViewModel) {
    val song = state.activeSong ?: state.player.currentSong
    val progress = if (state.player.durationMs > 0) {
        state.player.positionMs.toFloat() / state.player.durationMs.toFloat()
    } else 0f
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(28.dp))
            .background(Color.White.copy(alpha = 0.08f))
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Cover(song = song, size = 96)
        Spacer(Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(song?.name ?: "还没有播放歌曲", maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold)
            Text(song?.artist ?: "搜索并播放一首歌", maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            LinearProgressIndicator(progress = progress.coerceIn(0f, 1f), modifier = Modifier.fillMaxWidth())
            Slider(
                value = state.player.positionMs.toFloat(),
                onValueChange = { viewModel.seekTo(it.toLong()) },
                valueRange = 0f..max(1L, state.player.durationMs).toFloat()
            )
            CurrentLyric(lyrics = state.lyrics, positionMs = state.player.positionMs)
        }
        IconButton(onClick = viewModel::togglePlayPause) {
            Icon(if (state.player.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, contentDescription = "播放")
        }
    }
}

@Composable
private fun SongRow(
    song: Song,
    isFavorite: Boolean,
    onPlay: () -> Unit,
    onFavorite: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(Color.White.copy(alpha = 0.06f))
            .clickable(onClick = onPlay)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Cover(song = song, size = 56)
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(song.name, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold)
            Text(song.artist, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        IconButton(onClick = onFavorite) {
            Icon(if (isFavorite) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, contentDescription = "收藏")
        }
    }
}

@Composable
private fun Cover(song: Song?, size: Int) {
    Box(
        modifier = Modifier
            .size(size.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(Color.White.copy(alpha = 0.10f)),
        contentAlignment = Alignment.Center
    ) {
        if (!song?.coverUrl.isNullOrBlank()) {
            AsyncImage(
                model = song!!.coverUrl,
                contentDescription = song.name,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        } else {
            Text("Nano", fontWeight = FontWeight.Black, color = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun CurrentLyric(lyrics: List<LyricLine>, positionMs: Long) {
    val line = lyrics.lastOrNull { positionMs >= it.timeMs }?.text ?: lyrics.firstOrNull()?.text
    if (!line.isNullOrBlank()) {
        Text(
            text = line,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.Bold
        )
    }
}
