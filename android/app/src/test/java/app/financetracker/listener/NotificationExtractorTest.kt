package app.financetracker.listener

import app.financetracker.listener.capture.NotificationExtractor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NotificationExtractorTest {
    private val pkg = "com.bca.mybca.omni.android"
    private val monitored = setOf(pkg)

    private fun extract(
        packageName: String = pkg,
        title: CharSequence? = "Catatan Finansial",
        text: CharSequence? = "Pengeluaran sebesar IDR 10,000.00 di kategori Makanan.",
        bigText: CharSequence? = null,
        groupSummary: Boolean = false,
        ongoing: Boolean = false,
    ) = NotificationExtractor.extract(packageName, monitored, "key1", 1_763_700_000_123, title, text, bigText, groupSummary, ongoing)

    @Test fun `captures monitored notification as-is`() {
        val n = extract()!!
        assertEquals(pkg, n.packageName)
        assertEquals("Catatan Finansial", n.title)
        assertEquals("Pengeluaran sebesar IDR 10,000.00 di kategori Makanan.", n.text)
        assertEquals(1_763_700_000_123, n.postedAt)
        assertEquals("key1", n.key)
    }

    @Test fun `ignores unmonitored package`() = assertNull(extract(packageName = "com.whatsapp"))

    @Test fun `ignores group summary and ongoing`() {
        assertNull(extract(groupSummary = true))
        assertNull(extract(ongoing = true))
    }

    @Test fun `uses longest of text and big text`() {
        assertEquals("teks panjang lengkap", extract(text = "teks", bigText = "teks panjang lengkap")!!.text)
        assertEquals("teks lebih panjang", extract(text = "teks lebih panjang", bigText = "pendek")!!.text)
        assertEquals("hanya big", extract(text = null, bigText = "hanya big")!!.text)
    }

    @Test fun `ignores empty or blank body`() {
        assertNull(extract(text = null, bigText = null))
        assertNull(extract(text = "   ", bigText = ""))
    }

    @Test fun `null title becomes empty and whitespace is preserved`() {
        val n = extract(title = null, text = "  baris1\nbaris2  ")!!
        assertEquals("", n.title)
        assertEquals("  baris1\nbaris2  ", n.text)
    }

    @Test fun `truncates to server limits`() {
        val n = extract(title = "t".repeat(2_000), text = "x".repeat(20_000))!!
        assertEquals(NotificationExtractor.MAX_TITLE, n.title.length)
        assertEquals(NotificationExtractor.MAX_TEXT, n.text.length)
    }
}
