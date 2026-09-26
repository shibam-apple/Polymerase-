package expo.modules.sonar

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Continuous-wave sonar: plays a few quiet near-ultrasonic tones through the speaker and, from the
 * microphone, demodulates each tone's echo to complex baseband (I/Q) by integrate-and-dump over 0.1 s
 * blocks, i.e. 10 records per second. No audio is kept: only the baseband records are written, as
 * little-endian float32 [I1, Q1, I2, Q2, …] per block. The analysis runs in JS (src/sleep/sonar.ts).
 *
 * Integrate-and-dump is a sinc low-pass with nulls every 10 Hz, so tones 600 Hz apart don't leak into
 * each other, and breathing (≤ 0.7 Hz) and movement (a few Hz) pass. The local oscillators are
 * rotating phasors (one complex multiply per tone per sample), renormalised every block.
 */
object SonarEngine {
  const val FS = 48000
  const val BLOCK = FS / 10

  @Volatile var running = false
    private set
  @Volatile var live: ((FloatArray, Float) -> Unit)? = null
  var path: String? = null
    private set
  var startedAt = 0L
    private set
  @Volatile var records = 0
    private set
  var source = ""
    private set
  @Volatile var lastError = ""
    private set

  private var tones = floatArrayOf(18900f, 19500f, 20100f)
  private var volume = 0.3f
  private var player: Thread? = null
  private var recorder: Thread? = null

  fun unprocessedSupported(ctx: Context): Boolean {
    if (android.os.Build.VERSION.SDK_INT < 24) return false
    val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    return am.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED) == "true"
  }

  /** Media volume as 0–1: the tone plays on the media stream, so a muted phone sends nothing. */
  fun mediaVolume(ctx: Context): Float {
    val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val mx = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    return if (mx > 0) am.getStreamVolume(AudioManager.STREAM_MUSIC).toFloat() / mx else 0f
  }

  @Synchronized
  fun start(ctx: Context, toneHz: FloatArray, vol: Float, file: File) {
    if (running) return
    tones = toneHz
    volume = vol.coerceIn(0.02f, 1f)
    path = file.absolutePath
    records = 0
    lastError = ""
    startedAt = System.currentTimeMillis()
    running = true
    val unprocessed = unprocessedSupported(ctx)
    player = Thread({ play() }, "sonar-play").also { it.priority = Thread.MAX_PRIORITY; it.start() }
    recorder = Thread({ record(file, unprocessed) }, "sonar-record").also { it.priority = Thread.MAX_PRIORITY; it.start() }
  }

  @Synchronized
  fun stop() {
    if (!running) return
    running = false
    player?.join(2500)
    recorder?.join(2500)
    player = null
    recorder = null
  }

  private fun play() {
    val minBuf = AudioTrack.getMinBufferSize(FS, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT)
    val track = try {
      AudioTrack.Builder()
        .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
        .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_FLOAT).setSampleRate(FS).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
        .setBufferSizeInBytes(max(minBuf, 4 * BLOCK))
        .setTransferMode(AudioTrack.MODE_STREAM)
        .build()
    } catch (e: Exception) {
      lastError = "player: ${e.message}"
      return
    }
    val n = tones.size
    val phase = DoubleArray(n)
    val inc = DoubleArray(n) { 2 * PI * tones[it] / FS }
    val buf = FloatArray(BLOCK / 2)
    val amp = volume / n
    var sample = 0L
    var fadeOut = -1L
    track.play()
    try {
      while (true) {
        if (!running && fadeOut < 0) fadeOut = sample
        for (i in buf.indices) {
          // 1 s fade in and out, so starting and stopping makes no click.
          val fin = min(1.0, sample.toDouble() / FS)
          val fout = if (fadeOut >= 0) max(0.0, 1.0 - (sample - fadeOut).toDouble() / FS) else 1.0
          var s = 0.0
          for (k in 0 until n) {
            s += sin(phase[k])
            phase[k] += inc[k]
            if (phase[k] > 2 * PI) phase[k] -= 2 * PI
          }
          buf[i] = (amp * fin * fout * s).toFloat()
          sample++
        }
        track.write(buf, 0, buf.size, AudioTrack.WRITE_BLOCKING)
        if (fadeOut >= 0 && sample - fadeOut > FS) break
      }
    } finally {
      track.stop()
      track.release()
    }
  }

  @SuppressLint("MissingPermission")
  private fun record(file: File, unprocessed: Boolean) {
    val minBuf = AudioRecord.getMinBufferSize(FS, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_FLOAT)
    fun open(src: Int): AudioRecord? = try {
      AudioRecord.Builder()
        .setAudioSource(src)
        .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_FLOAT).setSampleRate(FS).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build())
        .setBufferSizeInBytes(max(minBuf, 8 * BLOCK))
        .build()
        .takeIf { it.state == AudioRecord.STATE_INITIALIZED }
    } catch (e: Exception) {
      null
    }
    val candidates = (if (unprocessed) listOf(MediaRecorder.AudioSource.UNPROCESSED to "unprocessed") else emptyList()) +
      listOf(MediaRecorder.AudioSource.VOICE_RECOGNITION to "voice_recognition", MediaRecorder.AudioSource.MIC to "mic")
    var rec: AudioRecord? = null
    for ((src, name) in candidates) {
      rec = open(src)
      if (rec != null) { source = name; break }
    }
    if (rec == null) {
      lastError = "microphone unavailable"
      running = false
      return
    }
    val n = tones.size
    // Local oscillators e^{-jωn} as rotating phasors.
    val cr = DoubleArray(n) { 1.0 }
    val ci = DoubleArray(n)
    val stepC = DoubleArray(n) { cos(2 * PI * tones[it] / FS) }
    val stepS = DoubleArray(n) { -sin(2 * PI * tones[it] / FS) }
    val x = FloatArray(BLOCK)
    val out = ByteBuffer.allocate(8 * n).order(ByteOrder.LITTLE_ENDIAN)
    val liveBuf = FloatArray(10 * 2 * n)
    var liveCount = 0
    var liveRms = 0f
    val stream = BufferedOutputStream(FileOutputStream(file), 64 * 1024)
    rec.startRecording()
    try {
      while (running) {
        var got = 0
        while (got < BLOCK && running) {
          val r = rec.read(x, got, BLOCK - got, AudioRecord.READ_BLOCKING)
          if (r <= 0) { lastError = "read $r"; break }
          got += r
        }
        if (got < BLOCK) { Thread.sleep(50); continue }
        val ai = DoubleArray(n)
        val aq = DoubleArray(n)
        var ss = 0.0
        for (i in 0 until BLOCK) {
          val v = x[i].toDouble()
          ss += v * v
          for (k in 0 until n) {
            ai[k] += v * cr[k]
            aq[k] += v * ci[k]
            val nr = cr[k] * stepC[k] - ci[k] * stepS[k]
            ci[k] = cr[k] * stepS[k] + ci[k] * stepC[k]
            cr[k] = nr
          }
        }
        out.clear()
        for (k in 0 until n) {
          // Keep the oscillators on the unit circle.
          val m = sqrt(cr[k] * cr[k] + ci[k] * ci[k])
          cr[k] /= m; ci[k] /= m
          val i = (ai[k] / BLOCK).toFloat()
          val q = (aq[k] / BLOCK).toFloat()
          out.putFloat(i); out.putFloat(q)
          liveBuf[liveCount * 2 * n + 2 * k] = i
          liveBuf[liveCount * 2 * n + 2 * k + 1] = q
        }
        stream.write(out.array())
        records++
        liveRms = max(liveRms, sqrt(ss / BLOCK).toFloat())
        liveCount++
        if (liveCount == 10) {
          live?.invoke(liveBuf.copyOf(), liveRms)
          liveCount = 0
          liveRms = 0f
        }
      }
    } finally {
      stream.flush()
      stream.close()
      rec.stop()
      rec.release()
    }
  }
}
