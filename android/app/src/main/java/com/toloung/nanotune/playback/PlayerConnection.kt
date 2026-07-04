package com.toloung.nanotune.playback

import android.content.ComponentName
import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.MoreExecutors
import com.toloung.nanotune.data.Song
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class PlayerConnection(context: Context) {
    private val appContext = context.applicationContext
    private var controller: MediaController? = null
    private val _state = MutableStateFlow(PlayerState())
    val state: StateFlow<PlayerState> = _state

    fun connect() {
        if (controller != null) return
        val token = SessionToken(appContext, ComponentName(appContext, NanoTunePlaybackService::class.java))
        val future = MediaController.Builder(appContext, token).buildAsync()
        future.addListener({
            controller = future.get().also { player ->
                player.addListener(object : Player.Listener {
                    override fun onIsPlayingChanged(isPlaying: Boolean) = publish()
                    override fun onPlaybackStateChanged(playbackState: Int) = publish()
                    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) = publish()
                })
                publish()
            }
        }, MoreExecutors.directExecutor())
    }

    fun play(song: Song, audioUrl: String) {
        val metadata = MediaMetadata.Builder()
            .setTitle(song.name)
            .setArtist(song.artist)
            .build()
        val item = MediaItem.Builder()
            .setUri(audioUrl)
            .setMediaId(song.id)
            .setMediaMetadata(metadata)
            .build()
        controller?.run {
            setMediaItem(item)
            prepare()
            play()
        }
        _state.value = _state.value.copy(currentSong = song, isPlaying = true)
    }

    fun togglePlayPause() {
        controller?.run {
            if (isPlaying) pause() else play()
        }
        publish()
    }

    fun seekTo(positionMs: Long) {
        controller?.seekTo(positionMs)
        publish()
    }

    fun publish() {
        val player = controller ?: return
        _state.value = _state.value.copy(
            isPlaying = player.isPlaying,
            durationMs = player.duration.takeIf { it > 0 } ?: 0L,
            positionMs = player.currentPosition.coerceAtLeast(0L)
        )
    }
}

data class PlayerState(
    val currentSong: Song? = null,
    val isPlaying: Boolean = false,
    val durationMs: Long = 0L,
    val positionMs: Long = 0L
)
