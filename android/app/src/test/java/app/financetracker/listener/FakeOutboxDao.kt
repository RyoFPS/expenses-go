package app.financetracker.listener

import app.financetracker.listener.data.OutboxDao
import app.financetracker.listener.data.OutboxEntity
import app.financetracker.listener.data.OutboxStatus
import app.financetracker.listener.data.StatusCount
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

/** DAO in-memory yang meniru semantik query Room (termasuk unique index). */
class FakeOutboxDao : OutboxDao {
    private val rows = MutableStateFlow<List<OutboxEntity>>(emptyList())
    private var nextId = 1L
    val all: List<OutboxEntity> get() = rows.value

    private fun update(ids: Collection<Long>, f: (OutboxEntity) -> OutboxEntity) {
        rows.value = rows.value.map { if (it.id in ids) f(it) else it }
    }

    override suspend fun insert(item: OutboxEntity): Long {
        val dup = rows.value.any {
            it.packageName == item.packageName && it.title == item.title && it.text == item.text && it.postedAt == item.postedAt
        }
        if (dup) return -1
        val row = item.copy(id = nextId++)
        rows.value = rows.value + row
        return row.id
    }

    override suspend fun countRecentSame(key: String, title: String, text: String, since: Long) =
        rows.value.count { it.notifKey == key && it.title == title && it.text == text && it.createdAt >= since }

    override suspend fun pending(limit: Int) =
        rows.value.filter { it.status == OutboxStatus.PENDING }.sortedBy { it.id }.take(limit)

    override suspend fun markSent(id: Long, rawId: String?, now: Long) =
        update(listOf(id)) { it.copy(status = OutboxStatus.SENT, sentAt = now, rawId = rawId, lastError = null) }

    override suspend fun markFailed(ids: List<Long>, error: String) =
        update(ids) { it.copy(status = OutboxStatus.FAILED, lastError = error, attempts = it.attempts + 1) }

    override suspend fun markRetry(ids: List<Long>, error: String) =
        update(ids) { it.copy(attempts = it.attempts + 1, lastError = error) }

    override suspend fun resend(id: Long): Int {
        val n = rows.value.count { it.id == id && it.status == OutboxStatus.FAILED }
        update(listOf(id)) { if (it.status == OutboxStatus.FAILED) it.copy(status = OutboxStatus.PENDING, lastError = null) else it }
        return n
    }

    override suspend fun resendAllFailed(): Int {
        val ids = rows.value.filter { it.status == OutboxStatus.FAILED }.map { it.id }
        update(ids) { it.copy(status = OutboxStatus.PENDING, lastError = null) }
        return ids.size
    }

    override suspend fun purgeSentBefore(before: Long): Int {
        val keep = rows.value.filterNot { it.status == OutboxStatus.SENT && (it.sentAt ?: Long.MAX_VALUE) < before }
        val n = rows.value.size - keep.size
        rows.value = keep
        return n
    }

    override fun observeRecent(limit: Int): Flow<List<OutboxEntity>> = rows.map { it.sortedByDescending { r -> r.id }.take(limit) }

    override fun observeCounts(): Flow<List<StatusCount>> =
        rows.map { list -> list.groupBy { it.status }.map { (s, l) -> StatusCount(s, l.size) } }
}
