package app.financetracker.listener

import app.financetracker.listener.data.ServerConfig
import app.financetracker.listener.sync.IngestClient
import app.financetracker.listener.sync.HeartbeatResult
import app.financetracker.listener.sync.ListenerHeartbeat
import app.financetracker.listener.sync.ItemResult
import app.financetracker.listener.sync.NotificationPayload
import app.financetracker.listener.sync.SendOutcome
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class IngestClientTest {
    private lateinit var server: MockWebServer
    private val items = listOf(
        NotificationPayload("com.bank", "Judul", "isi 1", 1_763_700_000_001),
        NotificationPayload("com.bank", "", "isi 2", 1_763_700_000_002),
    )

    @Before fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After fun tearDown() = server.close()

    private fun client(cfId: String = "", cfSecret: String = "") =
        IngestClient(ServerConfig(server.url("/").toString().trimEnd('/') + "/", "kunci-rahasia", cfId, cfSecret))

    private fun respond(code: Int, body: String = "") = server.enqueue(MockResponse.Builder().code(code).body(body).build())

    @Test fun `batch request has correct path headers and body`() = runTest {
        respond(200, """{"accepted":1,"duplicate":1,"results":[{"status":"accepted","raw_id":"r1"},{"status":"duplicate","raw_id":null}]}""")

        val outcome = client(cfId = "cid", cfSecret = "csecret").sendBatch(items)

        assertEquals(SendOutcome.Ok(listOf(ItemResult(true, "r1"), ItemResult(false, null))), outcome)
        val req = server.takeRequest()
        assertEquals("POST", req.method)
        assertEquals("/api/v1/ingest/notification/batch", req.url.encodedPath)
        assertEquals("kunci-rahasia", req.headers["X-API-Key"])
        assertEquals("cid", req.headers["CF-Access-Client-Id"])
        assertEquals("csecret", req.headers["CF-Access-Client-Secret"])
        val body = JSONArray(req.body!!.utf8())
        assertEquals(2, body.length())
        val first = body.getJSONObject(0)
        assertEquals("com.bank", first.getString("package_name"))
        assertEquals("Judul", first.getString("title"))
        assertEquals("isi 1", first.getString("text"))
        assertEquals(1_763_700_000_001L, first.getLong("posted_at"))
        assertEquals(setOf("package_name", "title", "text", "posted_at"), first.keys().asSequence().toSet())
    }

    @Test fun `heartbeat sends health only when listener is disabled and queue has failures`() = runTest {
        respond(204)
        assertEquals(HeartbeatResult.SENT, client().sendHeartbeat(ListenerHeartbeat("00000000-0000-0000-0000-000000000001", false, 2, 1, "0.1.0")))
        val req = server.takeRequest()
        assertEquals("/api/v1/ingest/listener-status/heartbeat", req.url.encodedPath)
        assertEquals("kunci-rahasia", req.headers["X-API-Key"])
        val body = JSONObject(req.body!!.utf8())
        assertEquals(false, body.getBoolean("listener_enabled"))
        assertEquals(2, body.getInt("pending_count"))
        assertEquals(1, body.getInt("failed_count"))
        assertEquals("0.1.0", body.getString("app_version"))
        assertEquals(setOf("device_id", "listener_enabled", "pending_count", "failed_count", "app_version"), body.keys().asSequence().toSet())
    }

    @Test fun `heartbeat rejects permanent errors and retries transient server errors`() = runTest {
        respond(401)
        respond(503)
        val c = client()
        assertEquals(HeartbeatResult.REJECTED, c.sendHeartbeat(ListenerHeartbeat("id", true, 0, 0, "0.1.0")))
        assertEquals(HeartbeatResult.RETRY, c.sendHeartbeat(ListenerHeartbeat("id", true, 0, 0, "0.1.0")))
    }

    @Test fun `cloudflare headers omitted when empty`() = runTest {
        respond(200, """{"accepted":2,"duplicate":0,"results":[{"status":"accepted","raw_id":"a"},{"status":"accepted","raw_id":"b"}]}""")
        client().sendBatch(items)
        val req = server.takeRequest()
        assertNull(req.headers["CF-Access-Client-Id"])
        assertNull(req.headers["CF-Access-Client-Secret"])
    }

    @Test fun `single send accepted and duplicate`() = runTest {
        respond(202, """{"status":"accepted","raw_id":"r9"}""")
        respond(200, """{"status":"duplicate"}""")
        val c = client()
        assertEquals(SendOutcome.Ok(listOf(ItemResult(true, "r9"))), c.sendOne(items[0]))
        assertEquals(SendOutcome.Ok(listOf(ItemResult(false, null))), c.sendOne(items[0]))
        assertEquals("/api/v1/ingest/notification", server.takeRequest().url.encodedPath)
        val body = JSONObject(server.takeRequest().body!!.utf8())
        assertEquals("isi 1", body.getString("text"))
    }

    @Test fun `http errors are classified`() = runTest {
        val cases = mapOf(
            401 to SendOutcome.Rejected::class,
            403 to SendOutcome.Rejected::class,
            302 to SendOutcome.Rejected::class,
            404 to SendOutcome.Rejected::class,
            422 to SendOutcome.Invalid::class,
            429 to SendOutcome.Retry::class,
            500 to SendOutcome.Retry::class,
            503 to SendOutcome.Retry::class,
        )
        for ((code, expected) in cases) {
            respond(code, """{"detail":"x"}""")
            val outcome = client().sendBatch(items)
            assertTrue("$code -> $outcome", expected.isInstance(outcome))
        }
    }

    @Test fun `408 is retried (OkHttp retries once itself, then we schedule retry)`() = runTest {
        respond(408)
        respond(408)
        assertTrue(client().sendBatch(items) is SendOutcome.Retry)
        assertTrue(IngestClient.classify(408) is SendOutcome.Retry)
    }

    @Test fun `mismatched or foreign 2xx body is retried, not marked sent`() = runTest {
        respond(200, """{"results":[{"status":"accepted","raw_id":"only-one"}]}""")
        respond(200, "<html>proxy</html>")
        assertTrue(client().sendBatch(items) is SendOutcome.Retry)
        assertTrue(client().sendBatch(items) is SendOutcome.Retry)
    }

    @Test fun `network failure is retried`() = runTest {
        val url = server.url("/").toString()
        server.close()
        val outcome = IngestClient(ServerConfig(url, "k", "", "")).sendBatch(items)
        assertTrue(outcome is SendOutcome.Retry)
    }

    @Test fun `invalid url is rejected`() = runTest {
        assertTrue(IngestClient(ServerConfig("bukan url", "k", "", "")).sendBatch(items) is SendOutcome.Rejected)
    }
}
