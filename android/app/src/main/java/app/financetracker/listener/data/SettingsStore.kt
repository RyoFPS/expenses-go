@file:Suppress("DEPRECATION") // androidx.security-crypto deprecated, tetap dipakai sesuai PRD §12.4

package app.financetracker.listener.data

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Konfigurasi koneksi ke backend. Tidak pernah di-log. */
data class ServerConfig(
    val baseUrl: String,
    val apiKey: String,
    val cfClientId: String,
    val cfClientSecret: String,
) {
    override fun toString(): String = "ServerConfig(baseUrl=$baseUrl, secrets=***)"
}

/**
 * Semua pengaturan disimpan di EncryptedSharedPreferences (kunci di Android Keystore).
 * Daftar package yang dipantau ikut di sini dan di-cache di memori karena dibaca setiap notifikasi masuk.
 */
class SettingsStore(context: Context) {
    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        FILE,
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    private val _monitored = MutableStateFlow(prefs.getStringSet(KEY_PACKAGES, emptySet()).orEmpty().toSet())
    val monitoredPackages: StateFlow<Set<String>> = _monitored.asStateFlow()

    fun setMonitored(packageName: String, enabled: Boolean) {
        val next = if (enabled) _monitored.value + packageName else _monitored.value - packageName
        setMonitoredPackages(next)
    }

    fun setMonitoredPackages(packages: Set<String>) {
        prefs.edit { putStringSet(KEY_PACKAGES, packages) }
        _monitored.value = packages
    }

    fun serverConfig(): ServerConfig? {
        val url = prefs.getString(KEY_URL, null).orEmpty()
        val key = prefs.getString(KEY_API, null).orEmpty()
        if (url.isBlank() || key.isBlank()) return null
        return ServerConfig(
            baseUrl = url,
            apiKey = key,
            cfClientId = prefs.getString(KEY_CF_ID, null).orEmpty(),
            cfClientSecret = prefs.getString(KEY_CF_SECRET, null).orEmpty(),
        )
    }

    val baseUrl: String get() = prefs.getString(KEY_URL, null).orEmpty()
    fun hasApiKey() = !prefs.getString(KEY_API, null).isNullOrEmpty()
    fun hasCfClientId() = !prefs.getString(KEY_CF_ID, null).isNullOrEmpty()
    fun hasCfClientSecret() = !prefs.getString(KEY_CF_SECRET, null).isNullOrEmpty()

    /** Field secret yang null tidak diubah (agar layar Settings tidak perlu menampilkan secret lama). */
    fun saveServer(baseUrl: String, apiKey: String?, cfClientId: String?, cfClientSecret: String?) {
        prefs.edit {
            putString(KEY_URL, baseUrl.trim().trimEnd('/'))
            apiKey?.let { putString(KEY_API, it.trim()) }
            cfClientId?.let { putString(KEY_CF_ID, it.trim()) }
            cfClientSecret?.let { putString(KEY_CF_SECRET, it.trim()) }
        }
    }

    private companion object {
        const val FILE = "secure_settings"
        const val KEY_URL = "server_url"
        const val KEY_API = "api_key"
        const val KEY_CF_ID = "cf_client_id"
        const val KEY_CF_SECRET = "cf_client_secret"
        const val KEY_PACKAGES = "monitored_packages"
    }
}
