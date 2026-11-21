package app.financetracker.listener.sync

import app.financetracker.listener.data.OutboxDao
import app.financetracker.listener.data.OutboxEntity

/** Hasil satu putaran sinkronisasi. */
enum class SyncResult { DONE, RETRY_LATER }

/**
 * Kirim semua item PENDING ke server dalam batch (maks 100, sesuai batas server).
 *
 * - Sukses (accepted/duplicate) -> SENT. Server idempoten (content_hash), jadi kirim ulang aman.
 * - Retry (jaringan/5xx) -> tetap PENDING, attempts++ ; WorkManager mengulang dengan backoff, tanpa batas.
 * - Invalid (422 batch) -> dikirim satu per satu agar hanya item yang rusak yang FAILED.
 * - Rejected (401/403) -> FAILED; pengguna memperbaiki konfigurasi lalu "kirim ulang".
 */
class OutboxSyncer(
    private val dao: OutboxDao,
    private val api: IngestApi,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    suspend fun syncAll(): SyncResult {
        while (true) {
            val batch = dao.pending(BATCH_SIZE)
            if (batch.isEmpty()) break
            when (val outcome = api.sendBatch(batch.map { it.toPayload() })) {
                is SendOutcome.Ok -> markSent(batch, outcome.results)
                is SendOutcome.Retry -> {
                    dao.markRetry(batch.map { it.id }, outcome.reason)
                    return SyncResult.RETRY_LATER
                }
                is SendOutcome.Rejected -> {
                    dao.markFailed(batch.map { it.id }, outcome.reason)
                    return SyncResult.DONE // tidak ada gunanya mencoba item lain dengan konfigurasi yang sama
                }
                is SendOutcome.Invalid -> if (sendIndividually(batch) == SyncResult.RETRY_LATER) {
                    return SyncResult.RETRY_LATER
                }
            }
        }
        dao.purgeSentBefore(clock() - KEEP_SENT_MS)
        return SyncResult.DONE
    }

    private suspend fun sendIndividually(batch: List<OutboxEntity>): SyncResult {
        for (item in batch) {
            when (val outcome = api.sendOne(item.toPayload())) {
                is SendOutcome.Ok -> markSent(listOf(item), outcome.results)
                is SendOutcome.Invalid -> dao.markFailed(listOf(item.id), outcome.reason)
                is SendOutcome.Rejected -> dao.markFailed(listOf(item.id), outcome.reason)
                is SendOutcome.Retry -> {
                    dao.markRetry(listOf(item.id), outcome.reason)
                    return SyncResult.RETRY_LATER
                }
            }
        }
        return SyncResult.DONE
    }

    private suspend fun markSent(items: List<OutboxEntity>, results: List<ItemResult>) {
        val now = clock()
        items.zip(results).forEach { (item, r) -> dao.markSent(item.id, r.rawId, now) }
    }

    companion object {
        const val BATCH_SIZE = 100
        const val KEEP_SENT_MS = 30L * 24 * 60 * 60 * 1000

        fun OutboxEntity.toPayload() = NotificationPayload(packageName, title, text, postedAt)
    }
}
