package app.financetracker.listener.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.financetracker.listener.FinanceApp
import java.util.concurrent.TimeUnit

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as FinanceApp
        // Belum dikonfigurasi: item tetap PENDING dan terkirim setelah pengguna menyimpan pengaturan.
        val config = app.settings.serverConfig() ?: return Result.success()
        val syncer = OutboxSyncer(app.database.outboxDao(), IngestClient(config))
        return when (syncer.syncAll()) {
            SyncResult.DONE -> Result.success()
            SyncResult.RETRY_LATER -> Result.retry() // exponential backoff, tanpa batas percobaan
        }
    }
}

object SyncScheduler {
    private const val UNIQUE_NOW = "outbox-sync"
    private const val UNIQUE_PERIODIC = "outbox-sync-periodic"

    private val constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    /** Dipanggil setiap ada item baru / kirim ulang. APPEND_OR_REPLACE: tidak hilang meski sync sedang berjalan. */
    fun enqueueNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_NOW, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    /** Jaring pengaman: coba kirim outbox tiap 15 menit (minimum WorkManager). */
    fun schedulePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(UNIQUE_PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request)
    }
}
