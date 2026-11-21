package app.financetracker.listener.capture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import app.financetracker.listener.FinanceApp
import app.financetracker.listener.sync.SyncScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Menangkap notifikasi dari app yang dipilih pengguna, menyimpannya ke outbox (Room), lalu
 * memicu sinkronisasi WorkManager. Isi notifikasi tidak pernah di-log.
 */
class FinanceNotificationListener : NotificationListenerService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        capture(sbn)
    }

    /** Tangkap notifikasi yang masih tampil saat listener (re)connect, mis. setelah proses mati. */
    override fun onListenerConnected() {
        runCatching { activeNotifications }.getOrNull()?.forEach { capture(it) }
    }

    private fun capture(sbn: StatusBarNotification) {
        val app = application as FinanceApp
        val monitored = app.settings.monitoredPackages.value
        if (sbn.packageName !in monitored) return

        val n = sbn.notification
        val extras = n.extras
        val captured = NotificationExtractor.extract(
            packageName = sbn.packageName,
            monitored = monitored,
            key = sbn.key,
            postedAt = sbn.postTime,
            title = extras.getCharSequence(Notification.EXTRA_TITLE),
            text = extras.getCharSequence(Notification.EXTRA_TEXT),
            bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT),
            isGroupSummary = (n.flags and Notification.FLAG_GROUP_SUMMARY) != 0,
            isOngoing = (n.flags and Notification.FLAG_ONGOING_EVENT) != 0,
        ) ?: return

        scope.launch {
            if (app.outbox.enqueue(captured)) {
                Log.i(TAG, "captured notification from ${captured.packageName}")
                SyncScheduler.enqueueNow(applicationContext)
            }
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private companion object {
        const val TAG = "FinanceListener"
    }
}
