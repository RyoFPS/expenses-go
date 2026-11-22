package app.financetracker.listener.sync

import app.financetracker.listener.data.ServerConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

data class NotificationPayload(val packageName: String, val title: String, val text: String, val postedAt: Long)
data class ListenerHeartbeat(
    val deviceId: String,
    val listenerEnabled: Boolean,
    val pendingCount: Int,
    val failedCount: Int,
    val appVersion: String,
)

enum class HeartbeatResult { SENT, RETRY, REJECTED }

data class ItemResult(val accepted: Boolean, val rawId: String?)

/** Hasil satu request ke server, sudah diklasifikasikan untuk keputusan retry. */
sealed interface SendOutcome {
    /** Hasil per item, urutan sama dengan request. */
    data class Ok(val results: List<ItemResult>) : SendOutcome

    /** Jaringan/server sementara bermasalah (IO, 408, 429, 5xx): coba lagi nanti. */
    data class Retry(val reason: String) : SendOutcome

    /** Payload ditolak (422): untuk batch, kirim ulang per item agar item valid tetap masuk. */
    data class Invalid(val reason: String) : SendOutcome

    /** Ditolak permanen (401/403/redirect login/4xx lain): perlu perbaikan konfigurasi. */
    data class Rejected(val reason: String) : SendOutcome
}

interface IngestApi {
    suspend fun sendBatch(items: List<NotificationPayload>): SendOutcome
    suspend fun sendOne(item: NotificationPayload): SendOutcome
}

class IngestClient(
    private val config: ServerConfig,
    private val http: OkHttpClient = defaultHttpClient(),
) : IngestApi {

    suspend fun sendHeartbeat(heartbeat: ListenerHeartbeat): HeartbeatResult = withContext(Dispatchers.IO) {
        val request = try {
            Request.Builder()
                .url(config.baseUrl.trimEnd('/') + "/api/v1/ingest/listener-status/heartbeat")
                .header("X-API-Key", config.apiKey)
                .apply {
                    if (config.cfClientId.isNotEmpty()) header("CF-Access-Client-Id", config.cfClientId)
                    if (config.cfClientSecret.isNotEmpty()) header("CF-Access-Client-Secret", config.cfClientSecret)
                }
                .post(heartbeat.toJson().toString().toRequestBody(JSON))
                .build()
        } catch (_: IllegalArgumentException) {
            return@withContext HeartbeatResult.REJECTED
        }
        try {
            http.newCall(request).execute().use {
                when {
                    it.isSuccessful -> HeartbeatResult.SENT
                    classify(it.code) is SendOutcome.Retry -> HeartbeatResult.RETRY
                    else -> HeartbeatResult.REJECTED
                }
            }
        } catch (_: IOException) {
            HeartbeatResult.RETRY
        }
    }

    override suspend fun sendBatch(items: List<NotificationPayload>): SendOutcome {
        val body = JSONArray().apply { items.forEach { put(it.toJson()) } }.toString()
        return post("/api/v1/ingest/notification/batch", body) { json ->
            val results = JSONObject(json).getJSONArray("results")
            if (results.length() != items.size) throw JSONException("jumlah results tidak sesuai")
            List(results.length()) { i -> results.getJSONObject(i).toItemResult() }
        }
    }

    override suspend fun sendOne(item: NotificationPayload): SendOutcome =
        post("/api/v1/ingest/notification", item.toJson().toString()) { json ->
            listOf(JSONObject(json).toItemResult())
        }

    private suspend fun post(path: String, body: String, parse: (String) -> List<ItemResult>): SendOutcome =
        withContext(Dispatchers.IO) {
            val request = try {
                Request.Builder()
                    .url(config.baseUrl.trimEnd('/') + path)
                    .header("X-API-Key", config.apiKey)
                    .apply {
                        if (config.cfClientId.isNotEmpty()) header("CF-Access-Client-Id", config.cfClientId)
                        if (config.cfClientSecret.isNotEmpty()) header("CF-Access-Client-Secret", config.cfClientSecret)
                    }
                    .post(body.toRequestBody(JSON))
                    .build()
            } catch (e: IllegalArgumentException) {
                return@withContext SendOutcome.Rejected("URL server tidak valid")
            }
            try {
                http.newCall(request).execute().use { resp ->
                    val text = resp.body.string()
                    classify(resp.code) ?: try {
                        SendOutcome.Ok(parse(text))
                    } catch (e: JSONException) {
                        // Respons 2xx tapi bukan dari API ini (mis. halaman proxy): anggap sementara.
                        SendOutcome.Retry("Respons server tidak dikenali")
                    }
                }
            } catch (e: IOException) {
                SendOutcome.Retry("Jaringan: ${e.javaClass.simpleName}")
            }
        }

    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()

        private fun ListenerHeartbeat.toJson() = JSONObject()
            .put("device_id", deviceId)
            .put("listener_enabled", listenerEnabled)
            .put("pending_count", pendingCount)
            .put("failed_count", failedCount)
            .put("app_version", appVersion)

        fun defaultHttpClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            // Cloudflare Access tanpa token valid me-redirect ke halaman login: jangan diikuti.
            .followRedirects(false)
            .followSslRedirects(false)
            .build()

        /** null = sukses (2xx), parse body. */
        fun classify(code: Int): SendOutcome? = when {
            code in 200..299 -> null
            code == 401 || code == 403 -> SendOutcome.Rejected("Ditolak server ($code): cek API key / service token Cloudflare")
            code in 300..399 -> SendOutcome.Rejected("Dialihkan ($code): kemungkinan service token Cloudflare Access salah")
            code == 422 -> SendOutcome.Invalid("Payload ditolak server (422)")
            code == 408 || code == 429 || code >= 500 -> SendOutcome.Retry("Server sementara gagal ($code)")
            else -> SendOutcome.Rejected("Ditolak server ($code)")
        }

        private fun NotificationPayload.toJson() = JSONObject()
            .put("package_name", packageName)
            .put("title", title)
            .put("text", text)
            .put("posted_at", postedAt)

        private fun JSONObject.toItemResult(): ItemResult {
            val status = getString("status")
            if (status != "accepted" && status != "duplicate") throw JSONException("status tidak dikenal: $status")
            return ItemResult(accepted = status == "accepted", rawId = optString("raw_id").takeIf { it.isNotEmpty() && it != "null" })
        }
    }
}
