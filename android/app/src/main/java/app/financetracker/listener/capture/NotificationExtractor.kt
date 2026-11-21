package app.financetracker.listener.capture

/** Notifikasi mentah yang siap masuk outbox. Tidak ada parsing di Android (PRD §12.6). */
data class CapturedNotification(
    val packageName: String,
    val title: String,
    val text: String,
    val postedAt: Long,
    val key: String,
)

object NotificationExtractor {
    // Sama dengan batas validasi server (backend/app/schemas/ingest.py).
    const val MAX_TITLE = 1_000
    const val MAX_TEXT = 10_000

    /**
     * - Abaikan package yang tidak dipantau, notifikasi group summary (ringkasan dari notifikasi anak
     *   yang juga ditangkap), dan notifikasi ongoing (progress/foreground service, bukan transaksi).
     * - text = yang terpanjang dari EXTRA_TEXT dan EXTRA_BIG_TEXT (PRD §12.2). Kosong -> diabaikan.
     * - Teks tidak diubah selain dipotong ke batas server (sangat jarang terjadi).
     */
    fun extract(
        packageName: String,
        monitored: Set<String>,
        key: String,
        postedAt: Long,
        title: CharSequence?,
        text: CharSequence?,
        bigText: CharSequence?,
        isGroupSummary: Boolean,
        isOngoing: Boolean,
    ): CapturedNotification? {
        if (packageName !in monitored || isGroupSummary || isOngoing) return null
        val body = listOfNotNull(text?.toString(), bigText?.toString()).maxByOrNull { it.length }
        if (body.isNullOrBlank()) return null
        return CapturedNotification(
            packageName = packageName,
            title = title?.toString().orEmpty().take(MAX_TITLE),
            text = body.take(MAX_TEXT),
            postedAt = postedAt,
            key = key,
        )
    }
}
