package app.financetracker.listener.ui

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.financetracker.listener.FinanceApp
import app.financetracker.listener.data.OutboxEntity
import app.financetracker.listener.data.OutboxStatus
import app.financetracker.listener.sync.SyncScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as FinanceApp
        setContent {
            MaterialTheme(colorScheme = if (isSystemInDarkTheme()) darkColorScheme() else lightColorScheme()) {
                AppScreen(app)
            }
        }
    }
}

private enum class Tab(val label: String) { STATUS("Status"), APPS("Aplikasi"), SERVER("Server"), OUTBOX("Outbox") }

@Composable
private fun AppScreen(app: FinanceApp) {
    var tab by rememberSaveable { mutableStateOf(Tab.STATUS) }
    Scaffold(
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { t ->
                    NavigationBarItem(selected = tab == t, onClick = { tab = t }, icon = {}, label = { Text(t.label) })
                }
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            when (tab) {
                Tab.STATUS -> StatusScreen(app)
                Tab.APPS -> AppsScreen(app)
                Tab.SERVER -> ServerScreen(app)
                Tab.OUTBOX -> OutboxScreen(app)
            }
        }
    }
}

// --- Status ------------------------------------------------------------------

private fun Context.listenerEnabled() = NotificationManagerCompat.getEnabledListenerPackages(this).contains(packageName)

private fun Context.ignoringBatteryOptimizations() =
    (getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName)

@Composable
private fun StatusScreen(app: FinanceApp) {
    val context = LocalContext.current
    var refresh by remember { mutableIntStateOf(0) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { refresh++ }
    val listenerOn = remember(refresh) { context.listenerEnabled() }
    val batteryOk = remember(refresh) { context.ignoringBatteryOptimizations() }
    val counts by app.database.outboxDao().observeCounts().collectAsStateWithLifecycle(emptyList())
    val monitored by app.settings.monitoredPackages.collectAsStateWithLifecycle()
    val configured = remember(refresh) { app.settings.serverConfig() != null }

    Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Finance Listener", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)

        StatusCard(
            title = "Akses notifikasi",
            ok = listenerOn,
            okText = "Aktif",
            badText = "Belum diizinkan. App tidak bisa membaca notifikasi.",
        ) {
            Button(onClick = { context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }) {
                Text("Buka pengaturan akses notifikasi")
            }
            if (!listenerOn) {
                Text(
                    "Android 13+: jika tombol izin abu-abu (\"Restricted setting\"), buka Info aplikasi → menu ⋮ → " +
                        "\"Izinkan setelan terbatas\", lalu coba lagi.",
                    style = MaterialTheme.typography.bodySmall,
                )
                TextButton(onClick = { context.openAppDetails() }) { Text("Buka Info aplikasi") }
            }
        }

        StatusCard(
            title = "Optimasi baterai",
            ok = batteryOk,
            okText = "Dikecualikan (disarankan)",
            badText = "Masih dioptimasi. Sistem bisa mematikan listener di latar belakang.",
        ) {
            Text(
                "Pilih \"Semua aplikasi\" → Finance Listener → \"Jangan optimalkan\". Di HP Xiaomi/Oppo/Vivo/Samsung " +
                    "aktifkan juga \"Autostart\" dan set baterai app ke \"Tanpa batasan\".",
                style = MaterialTheme.typography.bodySmall,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }) {
                    Text("Pengaturan baterai")
                }
                TextButton(onClick = { context.openAppDetails() }) { Text("Info aplikasi") }
            }
        }

        StatusCard(title = "Server", ok = configured, okText = "Terkonfigurasi", badText = "URL server / API key belum diisi (tab Server).") {}
        StatusCard(title = "Aplikasi dipantau", ok = monitored.isNotEmpty(), okText = "${monitored.size} aplikasi", badText = "Belum ada (tab Aplikasi).") {}

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("Outbox", fontWeight = FontWeight.SemiBold)
                val byStatus = counts.associate { it.status to it.n }
                Text("Menunggu: ${byStatus[OutboxStatus.PENDING] ?: 0} · Terkirim: ${byStatus[OutboxStatus.SENT] ?: 0} · Gagal: ${byStatus[OutboxStatus.FAILED] ?: 0}")
            }
        }
    }
}

private fun Context.openAppDetails() {
    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
}

@Composable
private fun StatusCard(title: String, ok: Boolean, okText: String, badText: String, actions: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            Text(
                (if (ok) "✓ " else "✗ ") + (if (ok) okText else badText),
                color = if (ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
            )
            actions()
        }
    }
}

// --- Aplikasi ----------------------------------------------------------------

private data class InstalledApp(val label: String, val packageName: String)

@Composable
private fun AppsScreen(app: FinanceApp) {
    val context = LocalContext.current
    val monitored by app.settings.monitoredPackages.collectAsStateWithLifecycle()
    var installed by remember { mutableStateOf<List<InstalledApp>?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    var manual by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(Unit) {
        installed = withContext(Dispatchers.IO) { context.launcherApps() }
    }

    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Pilih aplikasi bank / e-wallet yang notifikasinya dikirim ke server.", style = MaterialTheme.typography.bodyMedium)
        OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth(), label = { Text("Cari") }, singleLine = true)
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(manual, { manual = it }, Modifier.weight(1f), label = { Text("Tambah package manual") }, singleLine = true)
            Spacer(Modifier.width(8.dp))
            Button(enabled = manual.matches(Regex("[A-Za-z0-9_.]+")), onClick = { app.settings.setMonitored(manual.trim(), true); manual = "" }) {
                Text("Tambah")
            }
        }
        HorizontalDivider()
        val list = installed
        if (list == null) {
            Text("Memuat daftar aplikasi…")
        } else {
            val known = list.map { it.packageName }.toSet()
            val extra = (monitored - known).map { InstalledApp(it, it) }
            val shown = (extra + list)
                .filter { query.isBlank() || it.label.contains(query, true) || it.packageName.contains(query, true) }
                .sortedWith(compareByDescending<InstalledApp> { it.packageName in monitored }.thenBy { it.label.lowercase() })
            LazyColumn {
                items(shown, key = { it.packageName }) { item ->
                    val checked = item.packageName in monitored
                    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked, { app.settings.setMonitored(item.packageName, it) })
                        Column {
                            Text(item.label)
                            Text(item.packageName, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}

private fun Context.launcherApps(): List<InstalledApp> {
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    return packageManager.queryIntentActivities(intent, PackageManager.MATCH_ALL)
        .map { InstalledApp(it.loadLabel(packageManager).toString(), it.activityInfo.packageName) }
        .filter { it.packageName != packageName }
        .distinctBy { it.packageName }
}

// --- Server ------------------------------------------------------------------

@Composable
private fun ServerScreen(app: FinanceApp) {
    val context = LocalContext.current
    var url by rememberSaveable { mutableStateOf(app.settings.baseUrl) }
    var apiKey by rememberSaveable { mutableStateOf("") }
    var cfId by rememberSaveable { mutableStateOf("") }
    var cfSecret by rememberSaveable { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }
    var stored by remember { mutableIntStateOf(0) }
    val hasKey = remember(stored) { app.settings.hasApiKey() }
    val hasCfId = remember(stored) { app.settings.hasCfClientId() }
    val hasCfSecret = remember(stored) { app.settings.hasCfClientSecret() }
    val urlValid = url.trim().let { it.startsWith("https://") || it.startsWith("http://") }

    Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Koneksi server", style = MaterialTheme.typography.titleLarge)
        Text(
            "Secret disimpan terenkripsi di perangkat dan tidak ditampilkan lagi. Kosongkan field secret untuk mempertahankan nilai lama.",
            style = MaterialTheme.typography.bodySmall,
        )
        OutlinedTextField(
            url, { url = it }, Modifier.fillMaxWidth(), label = { Text("URL server") },
            placeholder = { Text("https://finance.domainmu.com") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
        )
        if (url.startsWith("http://")) {
            Text("Peringatan: HTTP tanpa enkripsi hanya untuk uji lokal (build debug).", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        SecretField("API key (X-API-Key)", apiKey, hasKey) { apiKey = it }
        SecretField("CF-Access-Client-Id", cfId, hasCfId) { cfId = it }
        SecretField("CF-Access-Client-Secret", cfSecret, hasCfSecret) { cfSecret = it }
        Button(
            enabled = urlValid && (hasKey || apiKey.isNotBlank()),
            onClick = {
                app.settings.saveServer(url, apiKey.ifBlank { null }, cfId.ifBlank { null }, cfSecret.ifBlank { null })
                apiKey = ""; cfId = ""; cfSecret = ""; stored++
                SyncScheduler.enqueueNow(context)
                message = "Tersimpan. Outbox yang tertunda akan dikirim."
            },
        ) { Text("Simpan") }
        message?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
    }
}

@Composable
private fun SecretField(label: String, value: String, stored: Boolean, onChange: (String) -> Unit) {
    OutlinedTextField(
        value, onChange, Modifier.fillMaxWidth(), singleLine = true,
        label = { Text(label) },
        placeholder = { Text(if (stored) "•••••• (tersimpan)" else "belum diisi") },
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
    )
}

// --- Outbox ------------------------------------------------------------------

private val timeFormat = SimpleDateFormat("dd MMM HH:mm:ss", Locale.forLanguageTag("id-ID"))

@Composable
private fun OutboxScreen(app: FinanceApp) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val dao = app.database.outboxDao()
    val items by dao.observeRecent().collectAsStateWithLifecycle(emptyList())

    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { SyncScheduler.enqueueNow(context) }) { Text("Kirim sekarang") }
            OutlinedButton(onClick = {
                scope.launch {
                    dao.resendAllFailed()
                    SyncScheduler.enqueueNow(context)
                }
            }) { Text("Kirim ulang yang gagal") }
        }
        if (items.isEmpty()) {
            Text("Belum ada notifikasi tertangkap.", Modifier.padding(top = 16.dp))
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(items, key = { it.id }) { item ->
                OutboxRow(item) {
                    scope.launch {
                        dao.resend(item.id)
                        SyncScheduler.enqueueNow(context)
                    }
                }
            }
        }
    }
}

@Composable
private fun OutboxRow(item: OutboxEntity, onResend: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            val (label, color) = when (item.status) {
                OutboxStatus.PENDING -> "Menunggu" to MaterialTheme.colorScheme.tertiary
                OutboxStatus.SENT -> "Terkirim" to MaterialTheme.colorScheme.primary
                OutboxStatus.FAILED -> "Gagal" to MaterialTheme.colorScheme.error
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(label, color = color, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(8.dp))
                Text(timeFormat.format(Date(item.postedAt)), style = MaterialTheme.typography.bodySmall)
                if (item.attempts > 0) Text(" · ${item.attempts}× coba", style = MaterialTheme.typography.bodySmall)
            }
            Text(item.packageName, style = MaterialTheme.typography.bodySmall)
            if (item.title.isNotEmpty()) Text(item.title, fontWeight = FontWeight.Medium)
            Text(item.text, maxLines = 3, style = MaterialTheme.typography.bodyMedium)
            item.lastError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            if (item.status == OutboxStatus.FAILED) {
                TextButton(onClick = onResend) { Text("Kirim ulang") }
            }
        }
    }
}
