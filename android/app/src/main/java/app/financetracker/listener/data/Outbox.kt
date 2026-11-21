package app.financetracker.listener.data

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

enum class OutboxStatus { PENDING, SENT, FAILED }

/**
 * Notifikasi yang ditangkap, menunggu dikirim ke server.
 * PENDING: belum terkirim (termasuk yang sedang di-retry karena jaringan/server).
 * SENT: server menerima (accepted) atau sudah punya (duplicate).
 * FAILED: ditolak permanen (key salah/payload tidak valid); perlu "kirim ulang" manual.
 */
@Entity(
    tableName = "outbox",
    indices = [
        Index(value = ["packageName", "title", "text", "postedAt"], unique = true),
        Index(value = ["status"]),
        Index(value = ["notifKey"]),
    ],
)
data class OutboxEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val packageName: String,
    val title: String,
    val text: String,
    val postedAt: Long,
    val notifKey: String,
    val status: OutboxStatus = OutboxStatus.PENDING,
    val attempts: Int = 0,
    val lastError: String? = null,
    val rawId: String? = null,
    val createdAt: Long,
    val sentAt: Long? = null,
)

data class StatusCount(
    @ColumnInfo(name = "status") val status: OutboxStatus,
    @ColumnInfo(name = "n") val n: Int,
)

@Dao
interface OutboxDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(item: OutboxEntity): Long

    @Query(
        "SELECT COUNT(*) FROM outbox WHERE notifKey = :key AND title = :title AND text = :text " +
            "AND createdAt >= :since"
    )
    suspend fun countRecentSame(key: String, title: String, text: String, since: Long): Int

    @Query("SELECT * FROM outbox WHERE status = 'PENDING' ORDER BY id LIMIT :limit")
    suspend fun pending(limit: Int): List<OutboxEntity>

    @Query("UPDATE outbox SET status = 'SENT', sentAt = :now, rawId = :rawId, lastError = NULL WHERE id = :id")
    suspend fun markSent(id: Long, rawId: String?, now: Long)

    @Query("UPDATE outbox SET status = 'FAILED', lastError = :error, attempts = attempts + 1 WHERE id IN (:ids)")
    suspend fun markFailed(ids: List<Long>, error: String)

    @Query("UPDATE outbox SET attempts = attempts + 1, lastError = :error WHERE id IN (:ids)")
    suspend fun markRetry(ids: List<Long>, error: String)

    @Query("UPDATE outbox SET status = 'PENDING', lastError = NULL WHERE id = :id AND status = 'FAILED'")
    suspend fun resend(id: Long): Int

    @Query("UPDATE outbox SET status = 'PENDING', lastError = NULL WHERE status = 'FAILED'")
    suspend fun resendAllFailed(): Int

    @Query("DELETE FROM outbox WHERE status = 'SENT' AND sentAt < :before")
    suspend fun purgeSentBefore(before: Long): Int

    @Query("SELECT * FROM outbox ORDER BY id DESC LIMIT :limit")
    fun observeRecent(limit: Int = 300): Flow<List<OutboxEntity>>

    @Query("SELECT status, COUNT(*) AS n FROM outbox GROUP BY status")
    fun observeCounts(): Flow<List<StatusCount>>
}

@Database(entities = [OutboxEntity::class], version = 1, exportSchema = true)
abstract class AppDatabase : RoomDatabase() {
    abstract fun outboxDao(): OutboxDao
}
