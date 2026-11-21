package app.financetracker.listener.capture

import app.financetracker.listener.data.OutboxDao
import app.financetracker.listener.data.OutboxEntity

class OutboxRepository(private val dao: OutboxDao, private val clock: () -> Long = System::currentTimeMillis) {

    /**
     * Simpan ke outbox. Mengembalikan false jika dilewati:
     * - persis sama (package, title, text, postedAt) dengan yang sudah ada (unique index), atau
     * - update dari notifikasi yang sama (key sama) dengan isi sama dalam [UPDATE_WINDOW_MS] —
     *   beberapa app memposting ulang notifikasi yang sama dengan postTime baru, yang di server
     *   akan dianggap raw berbeda.
     */
    suspend fun enqueue(n: CapturedNotification): Boolean {
        val now = clock()
        if (dao.countRecentSame(n.key, n.title, n.text, now - UPDATE_WINDOW_MS) > 0) return false
        val id = dao.insert(
            OutboxEntity(
                packageName = n.packageName,
                title = n.title,
                text = n.text,
                postedAt = n.postedAt,
                notifKey = n.key,
                createdAt = now,
            )
        )
        return id != -1L
    }

    companion object {
        const val UPDATE_WINDOW_MS = 10 * 60 * 1000L
    }
}
