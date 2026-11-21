// Reset DB stack uji dan isi data contoh yang realistis (relatif terhadap waktu sekarang).
import { api, sql } from "./backend"

type Ref = { id: string }
const BCA_PKG = "com.bca.mybca.omni.android"
const DAY = 86_400_000

export default async function globalSetup() {
  await api.get("/accounts") // gagal cepat jika backend uji belum jalan
  sql("TRUNCATE transactions, balance_snapshots, category_rules, categories, accounts, raw_notifications CASCADE")

  const bca = await api.post<Ref>("/accounts", { name: "BCA", type: "bank", package_name: BCA_PKG, opening_balance: 2_500_000 })
  const gopay = await api.post<Ref>("/accounts", { name: "GoPay", type: "ewallet", opening_balance: 150_000 })
  const tunai = await api.post<Ref>("/accounts", { name: "Tunai", type: "cash", opening_balance: 300_000 })

  const cat: Record<string, Ref> = {}
  for (const [name, type] of [
    ["Makanan", "expense"],
    ["Transportasi", "expense"],
    ["Belanja", "expense"],
    ["Tagihan Rutin", "expense"],
    ["Pembayaran", "expense"],
    ["Gaji", "income"],
    ["Transfer Rekening", "income"],
  ] as const) {
    cat[name] = await api.post<Ref>("/categories", { name, type })
  }
  await api.post("/category-rules", { match_type: "merchant_contains", pattern: "grab", category_id: cat.Transportasi.id, priority: 10 })

  const now = Date.now()
  const at = (daysAgo: number, hour = 12) => new Date(now - daysAgo * DAY - (12 - hour) * 3_600_000).toISOString()

  const manual: [Ref, "income" | "expense", number, string | null, string, number][] = [
    [bca, "income", 4_500_000, "Gaji", "PT Contoh Sejahtera", 25],
    [tunai, "expense", 35_000, "Makanan", "Warung Padang", 1],
    [tunai, "expense", 18_000, "Makanan", "Kopi Kenangan", 2],
    [gopay, "expense", 27_000, null, "Grab Bike", 3],
    [bca, "expense", 450_000, "Belanja", "Supermarket", 6],
    [gopay, "expense", 64_000, "Makanan", "Kopi Senja", 9],
    [bca, "expense", 350_000, "Tagihan Rutin", "PLN Pascabayar", 12],
    [tunai, "expense", 22_000, "Transportasi", "Angkot", 15],
    [bca, "expense", 120_000, "Belanja", "Toko Buku", 33],
  ]
  for (const [acc, type, amount, catName, merchant, daysAgo] of manual) {
    await api.post("/transactions", {
      account_id: acc.id,
      type,
      amount,
      merchant,
      category_id: catName ? cat[catName].id : null,
      occurred_at: at(daysAgo),
    })
  }
  await api.post("/transactions", { account_id: bca.id, to_account_id: gopay.id, type: "transfer", amount: 200_000, fee: 1_000, occurred_at: at(4) })

  // Notifikasi myBCA (format asli dari backend/tests/fixtures/bca).
  const notif = (text: string, minutesAgo: number) =>
    api.ingest({ package_name: BCA_PKG, title: "Catatan Finansial", text, posted_at: now - minutesAgo * 60_000 })
  await notif("Pengeluaran sebesar IDR 77,000.00 di kategori Makanan.", 90)
  await notif("Pemasukan sebesar IDR 73,000.00 dari INTI**RI ****SIH A di kategori Transfer Rekening.", 60)
  await notif("Pengeluaran sebesar IDR 12,500.50 di kategori Makanan.", 30) // sen != 0 -> perlu review
  await notif("Notifikasi format baru yang belum dikenal parser.", 10) // -> failed

  // Snapshot saldo GoPay yang tidak cocok (tidak ada endpoint untuk ini; normalnya dari parser).
  sql(`INSERT INTO balance_snapshots (account_id, balance, observed_at) VALUES ('${gopay.id}', 250000, now() - interval '1 hour')`)
}
