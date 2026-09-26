package expo.modules.sonar

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class SonarModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "React context lost", null)

  private fun status(): Map<String, Any?> = mapOf(
    "running" to SonarEngine.running,
    "path" to SonarEngine.path,
    "startedAt" to SonarEngine.startedAt.toDouble(),
    "seconds" to SonarEngine.records / 10.0,
    "source" to SonarEngine.source,
    "error" to SonarEngine.lastError,
  )

  override fun definition() = ModuleDefinition {
    Name("Sonar")
    Events("onFrame")

    /**
     * Start the sonar. `live` = the in-app setup check (no service; frames streamed to JS once a
     * second). Otherwise it runs overnight in a foreground service.
     */
    AsyncFunction("start") { tones: List<Double>, volume: Double, live: Boolean ->
      val ctx = context
      val dir = File(ctx.filesDir, "sonar").apply { mkdirs() }
      val file = File(dir, if (live) "check.bin" else "night-${System.currentTimeMillis()}.bin")
      val hz = tones.map { it.toFloat() }.toFloatArray()
      if (live) {
        SonarEngine.live = { iq, rms -> sendEvent("onFrame", mapOf("iq" to iq.map { it.toDouble() }, "rms" to rms.toDouble(), "seconds" to SonarEngine.records / 10.0)) }
        SonarEngine.start(ctx, hz, volume.toFloat(), file)
      } else {
        SonarEngine.live = null
        val intent = Intent(ctx, SonarService::class.java)
          .putExtra(SonarService.EXTRA_PATH, file.absolutePath)
          .putExtra(SonarService.EXTRA_TONES, hz)
          .putExtra(SonarService.EXTRA_VOLUME, volume.toFloat())
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(intent) else ctx.startService(intent)
      }
      mapOf(
        "path" to file.absolutePath,
        "unprocessed" to SonarEngine.unprocessedSupported(ctx),
        "mediaVolume" to SonarEngine.mediaVolume(ctx).toDouble(),
      )
    }

    AsyncFunction("stop") {
      val ctx = context
      val info = status()
      SonarEngine.live = null
      SonarEngine.stop()
      ctx.stopService(Intent(ctx, SonarService::class.java))
      info
    }

    Function("status") { status() }

    /** The recorded baseband file as base64 (a night is a few MB). */
    AsyncFunction("read") { path: String ->
      val f = File(path)
      if (!f.exists()) throw CodedException("NO_FILE", "No recording at $path", null)
      Base64.encodeToString(f.readBytes(), Base64.NO_WRAP)
    }

    AsyncFunction("remove") { path: String -> File(path).delete() }

    OnDestroy {
      SonarEngine.live = null
    }
  }
}
