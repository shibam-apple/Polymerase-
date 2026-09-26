package expo.modules.sonar

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import java.io.File

/**
 * Keeps the sonar running overnight with the screen off: a foreground service (microphone +
 * media playback) with a quiet ongoing notification and a partial wake lock.
 */
class SonarService : Service() {
  companion object {
    const val CHANNEL = "sonar"
    const val EXTRA_PATH = "path"
    const val EXTRA_TONES = "tones"
    const val EXTRA_VOLUME = "volume"
  }

  private var wake: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Sleep tracking", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shown while ultrasonic sleep tracking is on"
        setShowBadge(false)
      })
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else legacyBuilder()
    val notification = builder
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Tracking your sleep")
      .setContentText("Ultrasonic breathing tracking is on. Tap “I’m up” in the app when you wake.")
      .setOngoing(true)
      .setContentIntent(open)
      .build()
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(7, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(7, notification)
    }
    wake = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "daily:sonar").apply {
      setReferenceCounted(false)
      acquire(14 * 60 * 60 * 1000L)
    }
    val path = intent?.getStringExtra(EXTRA_PATH)
    val tones = intent?.getFloatArrayExtra(EXTRA_TONES)
    if (path != null && tones != null) {
      SonarEngine.start(this, tones, intent?.getFloatExtra(EXTRA_VOLUME, 0.3f) ?: 0.3f, File(path))
    }
    return START_NOT_STICKY
  }

  @Suppress("DEPRECATION")
  private fun legacyBuilder() = Notification.Builder(this)

  override fun onDestroy() {
    SonarEngine.stop()
    wake?.let { if (it.isHeld) it.release() }
    wake = null
    super.onDestroy()
  }
}
