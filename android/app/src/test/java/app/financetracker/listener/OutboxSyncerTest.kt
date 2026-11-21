package app.financetracker.listener

import app.financetracker.listener.capture.CapturedNotification
import app.financetracker.listener.capture.OutboxRepository
import app.financetracker.listener.data.OutboxStatus
import app.financetracker.listener.sync.IngestApi
import app.financetracker.listener.sync.ItemResult
import app.financetracker.listener.sync.NotificationPayload
import app.financetracker.listener.sync.OutboxSyncer
import app.financetracker.listener.sync.SendOutcome
import app.financetracker.listener.sync.SyncResult
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Server palsu yang idempoten seperti backend asli (content_hash). */
class FakeServer : IngestApi {
    var online = true
    var rejectAll = false
    val invalidTexts = mutableSetOf<String>()
    val stored = linkedMapOf<NotificationPayload, String>()
    var batchCalls = 0
    var maxBatchSize = 0

    private fun store(p: NotificationPayload): ItemResult {
        val existing = stored[p]
        if (existing != null) return ItemResult(false, null)
        val id = "raw-${stored.size + 1}"
        stored[p] = id
        return ItemResult(true, id)
    }

    override suspend fun sendBatch(items: List<NotificationPayload>): SendOutcome {
        batchCalls++
        maxBatchSize = maxOf(maxBatchSize, items.size)
        if (!online) return SendOutcome.Retry("offline")
        if (rejectAll) return SendOutcome.Rejected("401")
        if (items.any { it.text in invalidTexts }) return SendOutcome.Invalid("422")
        return SendOutcome.Ok(items.map(::store))
    }

    override suspend fun sendOne(item: NotificationPayload): SendOutcome {
        if (!online) return SendOutcome.Retry("offline")
        if (item.text in invalidTexts) return SendOutcome.Invalid("422")
        return SendOutcome.Ok(listOf(store(item)))
    }
}

class OutboxSyncerTest {
    private val dao = FakeOutboxDao()
    private val server = FakeServer()
    private var now = 1_000_000_000L
    private val repo = OutboxRepository(dao) { now }
    private val syncer = OutboxSyncer(dao, server) { now }

    private suspend fun capture(i: Int, key: String = "k$i", text: String = "isi $i", postedAt: Long = 1_763_700_000_000L + i) =
        repo.enqueue(CapturedNotification("com.bank", "Judul", text, postedAt, key))

    @Test fun `online - all captured items sent once`() = runTest {
        repeat(3) { capture(it) }
        assertEquals(SyncResult.DONE, syncer.syncAll())
        assertTrue(dao.all.all { it.status == OutboxStatus.SENT && it.rawId != null })
        assertEquals(3, server.stored.size)
    }

    @Test fun `offline then online - everything delivered without duplicates`() = runTest {
        server.online = false
        repeat(5) { capture(it) }
        // Beberapa kali percobaan saat offline (WorkManager retry)
        repeat(3) { assertEquals(SyncResult.RETRY_LATER, syncer.syncAll()) }
        assertTrue(dao.all.all { it.status == OutboxStatus.PENDING && it.attempts == 3 })
        assertEquals(0, server.stored.size)

        server.online = true
        assertEquals(SyncResult.DONE, syncer.syncAll())
        assertEquals(5, server.stored.size)
        assertTrue(dao.all.all { it.status == OutboxStatus.SENT })

        // Sinkron ulang tidak mengirim apa-apa lagi
        val calls = server.batchCalls
        assertEquals(SyncResult.DONE, syncer.syncAll())
        assertEquals(calls, server.batchCalls)
        assertEquals(5, server.stored.size)
    }

    @Test fun `response lost after server stored - resend is reported duplicate, no double data`() = runTest {
        capture(1)
        // Server sudah menyimpan, tapi HP tidak menerima respons (koneksi putus) -> item masih PENDING
        server.sendBatch(listOf(NotificationPayload("com.bank", "Judul", "isi 1", 1_763_700_000_001L)))
        assertEquals(SyncResult.DONE, syncer.syncAll())
        assertEquals(1, server.stored.size)
        assertEquals(OutboxStatus.SENT, dao.all.single().status)
    }

    @Test fun `batches are capped at 100`() = runTest {
        repeat(250) { capture(it) }
        assertEquals(SyncResult.DONE, syncer.syncAll())
        assertEquals(100, server.maxBatchSize)
        assertEquals(3, server.batchCalls)
        assertEquals(250, server.stored.size)
    }

    @Test fun `invalid item in batch only fails that item`() = runTest {
        capture(1); capture(2, text = "rusak"); capture(3)
        server.invalidTexts += "rusak"
        assertEquals(SyncResult.DONE, syncer.syncAll())
        val byText = dao.all.associateBy { it.text }
        assertEquals(OutboxStatus.SENT, byText["isi 1"]!!.status)
        assertEquals(OutboxStatus.FAILED, byText["rusak"]!!.status)
        assertEquals(OutboxStatus.SENT, byText["isi 3"]!!.status)
    }

    @Test fun `rejected key marks failed, resend after fix delivers`() = runTest {
        capture(1)
        server.rejectAll = true
        assertEquals(SyncResult.DONE, syncer.syncAll())
        assertEquals(OutboxStatus.FAILED, dao.all.single().status)

        server.rejectAll = false // pengguna memperbaiki API key
        assertEquals(1, dao.resendAllFailed())
        syncer.syncAll()
        assertEquals(OutboxStatus.SENT, dao.all.single().status)
        assertEquals(1, server.stored.size)
    }

    @Test fun `old sent items are purged, pending kept`() = runTest {
        capture(1)
        syncer.syncAll()
        server.online = false
        capture(2)
        now += OutboxSyncer.KEEP_SENT_MS + 1
        server.online = true
        syncer.syncAll() // mengirim #2 lalu purge #1
        assertEquals(listOf("isi 2"), dao.all.map { it.text })
    }

    @Test fun `repository skips exact duplicates and same-key reposts within window`() = runTest {
        assertTrue(capture(1))
        assertFalse(capture(1)) // identik
        assertFalse(capture(1, postedAt = 1_763_700_999_999L)) // update notifikasi yang sama, postTime baru
        now += OutboxRepository.UPDATE_WINDOW_MS + 1
        assertTrue(capture(1, postedAt = 1_763_701_999_999L)) // lewat jendela: dianggap baru
        assertTrue(capture(9, key = "k-lain", text = "isi 1", postedAt = 1_763_702_000_000L)) // key beda
        assertEquals(3, dao.all.size)
    }
}
