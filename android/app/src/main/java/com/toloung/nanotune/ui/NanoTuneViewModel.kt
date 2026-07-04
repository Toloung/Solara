package com.toloung.nanotune.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.toloung.nanotune.data.LibraryStore
import com.toloung.nanotune.data.LyricLine
import com.toloung.nanotune.data.NanoTuneApi
import com.toloung.nanotune.data.Song
import com.toloung.nanotune.playback.PlayerConnection
import com.toloung.nanotune.playback.PlayerState
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class NanoTuneViewModel(
    private val api: NanoTuneApi,
    private val library: LibraryStore
) : ViewModel() {
    private val _ui = MutableStateFlow(
        NanoTuneUiState(
            isLoggedIn = api.isLoggedIn,
            queue = library.loadQueue(),
            favorites = library.loadFavorites(),
            baseUrl = api.baseUrl
        )
    )
    val ui: StateFlow<NanoTuneUiState> = _ui.asStateFlow()

    private var playerConnection: PlayerConnection? = null
    private var tickerJob: Job? = null

    fun connectPlayer(context: Context) {
        if (playerConnection != null) return
        playerConnection = PlayerConnection(context).also { connection ->
            connection.connect()
            viewModelScope.launch {
                connection.state.collect { playerState ->
                    _ui.value = _ui.value.copy(player = playerState)
                }
            }
        }
        tickerJob = viewModelScope.launch {
            while (true) {
                playerConnection?.publish()
                delay(500)
            }
        }
    }

    fun updateBaseUrl(value: String) {
        api.baseUrl = value
        _ui.value = _ui.value.copy(baseUrl = api.baseUrl)
    }

    fun login(password: String) {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(isBusy = true, error = null)
            runCatching { api.login(password) }
                .onSuccess { success ->
                    _ui.value = _ui.value.copy(isBusy = false, isLoggedIn = success, error = if (success) null else "密码不正确")
                }
                .onFailure { error ->
                    _ui.value = _ui.value.copy(isBusy = false, error = error.message ?: "登录失败")
                }
        }
    }

    fun search(keyword: String) {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(query = keyword, isBusy = true, error = null)
            runCatching { api.search(keyword) }
                .onSuccess { songs -> _ui.value = _ui.value.copy(isBusy = false, results = songs) }
                .onFailure { error -> _ui.value = _ui.value.copy(isBusy = false, error = error.message ?: "搜索失败") }
        }
    }

    fun play(song: Song) {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(isBusy = true, error = null, activeSong = song)
            runCatching {
                val audioUrl = api.resolveAudio(song) ?: error("没有可播放地址")
                val lyrics = api.getLyrics(song)
                playerConnection?.play(song, audioUrl)
                addToQueue(song)
                lyrics
            }.onSuccess { lyrics ->
                _ui.value = _ui.value.copy(isBusy = false, lyrics = lyrics, activeSong = song)
            }.onFailure { error ->
                _ui.value = _ui.value.copy(isBusy = false, error = error.message ?: "播放失败")
            }
        }
    }

    fun togglePlayPause() {
        playerConnection?.togglePlayPause()
    }

    fun seekTo(positionMs: Long) {
        playerConnection?.seekTo(positionMs)
    }

    fun addToQueue(song: Song) {
        val queue = (_ui.value.queue.filterNot { it.id == song.id } + song)
        library.saveQueue(queue)
        _ui.value = _ui.value.copy(queue = queue)
    }

    fun clearQueue() {
        library.saveQueue(emptyList())
        _ui.value = _ui.value.copy(queue = emptyList())
    }

    fun toggleFavorite(song: Song) {
        _ui.value = _ui.value.copy(favorites = library.toggleFavorite(song))
    }

    override fun onCleared() {
        tickerJob?.cancel()
        super.onCleared()
    }

    companion object {
        fun factory(context: Context): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return NanoTuneViewModel(
                    api = NanoTuneApi(context.applicationContext),
                    library = LibraryStore(context.applicationContext)
                ) as T
            }
        }
    }
}

data class NanoTuneUiState(
    val isLoggedIn: Boolean = false,
    val isBusy: Boolean = false,
    val error: String? = null,
    val baseUrl: String = NanoTuneApi.DEFAULT_BASE_URL,
    val query: String = "",
    val results: List<Song> = emptyList(),
    val queue: List<Song> = emptyList(),
    val favorites: List<Song> = emptyList(),
    val activeSong: Song? = null,
    val lyrics: List<LyricLine> = emptyList(),
    val player: PlayerState = PlayerState()
)
