package app.financetracker.listener

import android.app.Application
import androidx.room.Room
import app.financetracker.listener.capture.OutboxRepository
import app.financetracker.listener.data.AppDatabase
import app.financetracker.listener.data.SettingsStore
import app.financetracker.listener.sync.SyncScheduler

class FinanceApp : Application() {
    lateinit var settings: SettingsStore
        private set
    lateinit var database: AppDatabase
        private set
    lateinit var outbox: OutboxRepository
        private set

    override fun onCreate() {
        super.onCreate()
        settings = SettingsStore(this)
        database = Room.databaseBuilder(this, AppDatabase::class.java, "outbox.db").build()
        outbox = OutboxRepository(database.outboxDao())
        SyncScheduler.schedulePeriodic(this)
        SyncScheduler.enqueueNow(this) // kirim sisa outbox setelah app/proses dimulai ulang
    }
}
