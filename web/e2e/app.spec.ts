import { expect, test, type Page } from "@playwright/test"

import { api, sql } from "./backend"

type Tx = { id: string; amount: number; type: string; source: string; account_id: string; category_id: string | null; merchant: string | null }
type Page_<T> = { items: T[]; total: number }

const BCA_PKG = "com.bca.mybca.omni.android"
const PAGES = ["/", "/transaksi", "/akun", "/review", "/kategori", "/laporan"] as const
/** "1.056.501" dari angka, untuk dicocokkan dengan teks Rp di halaman (spasi/minus Unicode diabaikan). */
const digits = (n: number) => Math.abs(n).toLocaleString("id-ID")

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, "halaman tidak boleh scroll horizontal").toBeLessThanOrEqual(innerWidth)
}

function trackConsoleErrors(page: Page) {
  const errors: string[] = []
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", (e) => errors.push(e.message))
  return errors
}

const quickAddButton = (page: Page) => page.getByRole("button", { name: /^Catat (transaksi )?tunai$/ }).filter({ visible: true })

test.describe("semua halaman", () => {
  for (const path of PAGES) {
    test(`render ${path} tanpa error & tanpa scroll horizontal`, async ({ page }) => {
      const errors = trackConsoleErrors(page)
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
      await page.waitForLoadState("networkidle")
      await expectNoHorizontalScroll(page)
      expect(errors).toEqual([])
    })
  }

  test("detail transaksi menampilkan teks notifikasi mentah", async ({ page }) => {
    const txs = await api.get<Page_<Tx>>("/transactions?q=&page_size=100")
    const notif = txs.items.find((t) => t.source === "notification" && t.amount === 77_000)!
    await page.goto(`/transaksi/${notif.id}`)
    await expect(page.getByText("Notifikasi asli")).toBeVisible()
    await expect(page.getByText("Pengeluaran sebesar IDR 77,000.00 di kategori Makanan.")).toBeVisible()
    await expect(page.getByLabel("Nominal (Rp)")).toHaveValue("77.000")
    await expectNoHorizontalScroll(page)
  })
})

test("dashboard: total saldo, akun, ringkasan bulan", async ({ page }) => {
  const nw = await api.get<{ total: number }>("/reports/net-worth")
  await page.goto("/")
  const total = page.getByRole("region", { name: "Total saldo" })
  await expect(total).toContainText(digits(nw.total))
  await expect(page.getByRole("link", { name: /BCA.*Bank/ })).toBeVisible()
  await expect(page.getByRole("link", { name: /transaksi perlu dicek/ })).toBeVisible()
  await expect(page.getByText("Pengeluaran per kategori")).toBeVisible()
})

test("tambah cepat tunai selesai dalam 3 langkah", async ({ page }, info) => {
  const amount = info.project.name === "desktop" ? 23_456 : 12_345
  await page.goto("/")
  await expect(quickAddButton(page)).toBeVisible()

  // Langkah 1: buka. Langkah 2: ketik nominal (input sudah fokus otomatis). Langkah 3: simpan.
  await quickAddButton(page).click()
  await expect(page.getByLabel("Nominal")).toBeFocused()
  await page.keyboard.type(String(amount))
  await page.getByRole("button", { name: /^Simpan/ }).click()

  await expect(page.getByText(new RegExp(`Pengeluaran Rp.${digits(amount)} tersimpan`))).toBeVisible()
  const txs = await api.get<Page_<Tx>>("/transactions?type=expense&page_size=100")
  const created = txs.items.filter((t) => t.amount === amount)
  expect(created).toHaveLength(1)
  expect(created[0].source).toBe("manual")
  const accounts = await api.get<{ id: string; type: string }[]>("/accounts")
  expect(accounts.find((a) => a.id === created[0].account_id)?.type).toBe("cash") // default akun tunai
})

test("tambah cepat: validasi nominal kosong", async ({ page }) => {
  await page.goto("/transaksi")
  await quickAddButton(page).click()
  await page.getByRole("button", { name: /^Simpan/ }).click()
  await expect(page.getByText("Isi nominal lebih dari 0")).toBeVisible()
})

test("tanggal dan jam WIB bisa dipilih dan diubah", async ({ page }, info) => {
  const amount = info.project.name === "desktop" ? 34_567 : 45_678
  await page.goto("/")
  await quickAddButton(page).click()
  await page.getByLabel("Nominal").fill(String(amount))
  await page.getByRole("button", { name: /Sekarang · ubah waktu/ }).click()
  await page.getByLabel("Jam (WIB)").fill("23:30")
  await page.getByLabel("Waktu (WIB)").click()
  await expectNoHorizontalScroll(page)
  const day = page.locator('[data-slot="calendar"] button[data-day]').filter({ hasText: /^15$/ })
  const [d, m, y] = (await day.getAttribute("data-day"))!.split("/")
  await day.click()
  await page.getByRole("button", { name: /^Simpan/ }).click()
  await expect(page.getByText(new RegExp(`Pengeluaran Rp.${digits(amount)} tersimpan`))).toBeVisible()

  const created = (await api.get<Page_<Tx & { occurred_at: string }>>(`/transactions?type=expense&page_size=100`)).items.find(
    (tx) => tx.amount === amount
  )!
  expect(new Date(created.occurred_at).toISOString()).toBe(new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T23:30:00+07:00`).toISOString())

  await page.goto(`/transaksi/${created.id}`)
  await expect(page.getByLabel("Jam (WIB)")).toHaveValue("23:30")
  await page.getByLabel("Jam (WIB)").fill("00:30")
  await page.getByLabel("Waktu (WIB)").click()
  await page.locator('[data-slot="calendar"] button[data-day]').filter({ hasText: /^16$/ }).click()
  await expect(page.getByLabel("Jam (WIB)")).toHaveValue("00:30")
  await page.getByRole("button", { name: "Simpan perubahan" }).click()
  await expect(page.getByText("Perubahan disimpan")).toBeVisible()
  const updated = await api.get<{ occurred_at: string }>(`/transactions/${created.id}`)
  expect(new Date(updated.occurred_at).toISOString()).toBe(new Date(`${y}-${m.padStart(2, "0")}-16T00:30:00+07:00`).toISOString())
  await expectNoHorizontalScroll(page)
})

test("transaksi: cari & filter", async ({ page }) => {
  await page.goto("/transaksi")
  await page.getByRole("searchbox", { name: "Cari merchant atau catatan" }).fill("kopi")
  const main = page.getByRole("main")
  await expect(main.getByText("Kopi Kenangan").filter({ visible: true }).first()).toBeVisible()
  await expect(main.getByText("Kopi Senja").filter({ visible: true }).first()).toBeVisible()
  await expect(main.getByText("Supermarket").filter({ visible: true })).toHaveCount(0)
  await expect(main.getByText(/^2 transaksi$/)).toBeVisible()

  await page.getByRole("searchbox", { name: "Cari merchant atau catatan" }).fill("")
  await page.getByRole("button", { name: /^Filter/ }).click()
  await page.getByLabel("Tipe").click()
  await page.getByRole("option", { name: "Transfer" }).click()
  await expect(main.getByText(/^1 transaksi$/)).toBeVisible()
  await expect(main.getByText("BCA → GoPay").filter({ visible: true }).first()).toBeVisible()
})

test("transaksi: ubah kategori langsung dari tabel", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "tabel hanya tampil di desktop; mobile memakai halaman detail")
  const cats = await api.get<{ id: string; name: string }[]>("/categories")
  const transport = cats.find((c) => c.name === "Transportasi")!
  await page.goto("/transaksi")
  const row = page.getByRole("row", { name: /Grab Bike/ })
  await expect(row.getByRole("combobox")).toHaveText(/Tanpa kategori/)
  await row.getByRole("combobox").click()
  await page.getByRole("option", { name: "Transportasi" }).click()
  await expect(page.getByText("Kategori diperbarui")).toBeVisible()
  const txs = await api.get<Page_<Tx>>("/transactions?q=Grab")
  expect(txs.items[0].category_id).toBe(transport.id)
})

test("transaksi: edit di halaman detail", async ({ page }, info) => {
  const note = `Catatan ${info.project.name}`
  const txs = await api.get<Page_<Tx>>("/transactions?q=Warung")
  await page.goto(`/transaksi/${txs.items[0].id}`)
  await page.getByLabel("Catatan").fill(note)
  await page.getByRole("button", { name: "Simpan perubahan" }).click()
  await expect(page.getByText("Perubahan disimpan")).toBeVisible()
  expect((await api.get<Page_<Tx & { note: string }>>(`/transactions?q=${encodeURIComponent(note)}`)).total).toBe(1)
})

test("review: tandai transaksi perlu review & lihat notifikasi gagal", async ({ page }, info) => {
  // Notifikasi BCA dengan sen != 0 -> needs_review (unik per project).
  const cents = info.project.name === "desktop" ? 25 : 75
  await api.ingest({ package_name: BCA_PKG, title: "Catatan Finansial", text: `Pengeluaran sebesar IDR 4,321.${cents} di kategori Makanan.`, posted_at: Date.now() - 5 * 60_000 })
  await page.goto("/review")
  // Sen dibulatkan half-up oleh backend: .25 -> 4.321, .75 -> 4.322
  const card = page.getByRole("listitem").filter({ hasText: cents >= 50 ? "4.322" : "4.321" })
  await expect(card).toBeVisible()
  await card.getByRole("button", { name: "Sudah benar" }).click()
  await expect(page.getByText("Ditandai sudah dicek")).toBeVisible()
  await expect(card).toHaveCount(0)

  await page.getByRole("tab", { name: /Gagal dibaca/ }).click()
  await expect(page.getByText("Notifikasi format baru yang belum dikenal parser.")).toBeVisible()
  await expect(page.getByText(/tidak dikenali/)).toBeVisible()
  await page.getByRole("button", { name: "Parse ulang", exact: true }).click()
  await expect(page.getByText("Masih gagal")).toBeVisible()
})

test("akun: saldo tidak cocok -> buat transaksi penyesuaian", async ({ page }, info) => {
  const name = `Uji ${info.project.name}`
  const acc = await api.post<{ id: string }>("/accounts", { name, type: "ewallet", opening_balance: 100_000 })
  sql(`INSERT INTO balance_snapshots (account_id, balance, observed_at) VALUES ('${acc.id}', 90000, now() - interval '5 minutes')`)

  await page.goto("/akun")
  const card = page.getByRole("listitem").filter({ hasText: name })
  await expect(card.getByText("Saldo tidak cocok")).toBeVisible()
  await card.getByRole("button", { name: "Buat transaksi penyesuaian" }).click()
  await expect(page.getByText("Transaksi penyesuaian dibuat")).toBeVisible()
  await expect(card.getByText(/Cocok dengan saldo notifikasi/)).toBeVisible()
  await expect(card).toContainText("90.000")
  await api.patch(`/accounts/${acc.id}`, { is_active: false }) // jangan ganggu test lain
})

test("akun: tambah akun lewat dialog", async ({ page }, info) => {
  const name = `Dompet ${info.project.name}`
  await page.goto("/akun")
  await page.getByRole("button", { name: "Tambah akun" }).first().click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Nama").fill(name)
  await dialog.getByLabel("Saldo awal (Rp)").fill("50.000")
  await dialog.getByRole("button", { name: "Simpan" }).click()
  await expect(page.getByText("Akun dibuat")).toBeVisible()
  await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText("50.000")
  const acc = (await api.get<{ id: string; name: string; opening_balance: number }[]>("/accounts")).find((a) => a.name === name)!
  expect(acc.opening_balance).toBe(50_000)
  await api.patch(`/accounts/${acc.id}`, { is_active: false })
})

test("kategori: tambah kategori & aturan", async ({ page }, info) => {
  const name = `Hiburan ${info.project.name}`
  await page.goto("/kategori")
  await page.getByRole("button", { name: "Tambah" }).first().click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Nama").fill(name)
  await dialog.getByRole("button", { name: "Simpan" }).click()
  await expect(page.getByText("Kategori dibuat")).toBeVisible()
  await expect(page.getByText(name, { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Aturan", exact: true }).click()
  const ruleDialog = page.getByRole("dialog")
  await ruleDialog.getByLabel("Pola").fill(`bioskop-${info.project.name}`)
  await ruleDialog.getByLabel("Kategori").click()
  await page.getByRole("option", { name: `${name} (Pengeluaran)` }).click()
  await ruleDialog.getByRole("button", { name: "Simpan" }).click()
  await expect(page.getByText("Aturan disimpan")).toBeVisible()
  await expect(page.getByText(`bioskop-${info.project.name}`)).toBeVisible()
})

test("laporan: angka sesuai API", async ({ page }) => {
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date())
  const s = await api.get<{ income: number; expense: number; fees: number }>(`/reports/summary?month=${month}`)
  await page.goto("/laporan")
  const summary = page.getByRole("region", { name: /^Ringkasan/ })
  await expect(summary).toContainText(digits(s.income))
  await expect(summary).toContainText(digits(s.expense))
  await expect(summary).toContainText(digits(s.fees))
  await page.getByRole("button", { name: "Bulan sebelumnya" }).click()
  await expect(page.getByRole("region", { name: /^Ringkasan/ })).not.toContainText(digits(s.expense))
})

test("mode gelap & manifest PWA", async ({ page, request }) => {
  await page.goto("/")
  await page.getByRole("button", { name: /Mode (gelap|terang)/ }).filter({ visible: true }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)

  const manifest = await (await request.get("/manifest.webmanifest")).json()
  expect(manifest.display).toBe("standalone")
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200)
})

test("mobile: menu Lainnya (buka, navigasi, Esc, klik di luar)", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-375", "menu Lainnya hanya ada di navigasi bawah mobile")
  await page.goto("/")
  const toggle = page.getByRole("button", { name: "Lainnya" })
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-expanded", "true")
  await page.keyboard.press("Escape")
  await expect(toggle).toHaveAttribute("aria-expanded", "false")

  await toggle.click()
  await page.getByRole("heading", { level: 1 }).first().click()
  await expect(toggle).toHaveAttribute("aria-expanded", "false")

  await toggle.click()
  await page.getByRole("navigation", { name: "Navigasi utama" }).getByRole("link", { name: "Laporan" }).click()
  await expect(page).toHaveURL(/\/laporan$/)
  await expect(page.getByRole("heading", { name: "Laporan" })).toBeVisible()
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
})
