// Format uang & waktu. Semua nominal integer rupiah; tampilan waktu selalu Asia/Jakarta.

export const TZ = "Asia/Jakarta"

const rupiah = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 })

/**
 * 1500000 -> "Rp 1.500.000"; negatif -> "−Rp 1.500.000".
 * Memakai spasi tak-putus dan tanda minus Unicode (U+2212) agar nominal tidak pernah terpotong baris.
 */
export function formatRupiah(value: number, opts: { sign?: boolean } = {}): string {
  const abs = `Rp ${rupiah.format(Math.abs(value))}`
  if (value < 0) return `−${abs}`
  if (opts.sign && value > 0) return `+${abs}`
  return abs
}

/** Ringkas untuk sumbu chart: 1.500.000 -> "1,5 jt". */
export function formatCompact(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? "−" : ""
  const fmt = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 1 })
  if (abs >= 1_000_000_000) return `${sign}${fmt(abs / 1_000_000_000)} M`
  if (abs >= 1_000_000) return `${sign}${fmt(abs / 1_000_000)} jt`
  if (abs >= 1_000) return `${sign}${fmt(abs / 1_000)} rb`
  return `${sign}${abs}`
}

/**
 * Input nominal dari pengguna -> integer rupiah. Titik/koma/spasi dianggap pemisah ribuan
 * ("25.000", "25,000", "25 000" -> 25000). Mengembalikan null jika tidak valid atau <= 0.
 */
export function parseRupiahInput(raw: string): number | null {
  const digits = raw.replace(/^\s*rp\.?\s*/i, "").replace(/[.,\s]/g, "")
  if (!/^\d+$/.test(digits)) return null
  const n = Number(digits)
  if (!Number.isSafeInteger(n) || n <= 0) return null
  return n
}

/** Tampilkan angka saat mengetik: "25000" -> "25.000". */
export function formatRupiahInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "")
  return digits ? rupiah.format(Number(digits)) : ""
}

const dateFmt = new Intl.DateTimeFormat("id-ID", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" })
const dateTimeFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
})
const timeFmt = new Intl.DateTimeFormat("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })
const dayLabelFmt = new Intl.DateTimeFormat("id-ID", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" })
const monthFmt = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", month: "long", year: "numeric" })
const shortDayFmt = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", day: "numeric", month: "short" })
const shortMonthFmt = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", month: "short" })

export const formatDate = (iso: string) => dateFmt.format(new Date(iso))
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso))
export const formatTime = (iso: string) => timeFmt.format(new Date(iso))
export const formatDayLabel = (iso: string) => dayLabelFmt.format(new Date(iso))

/** "2026-11" -> "November 2026" */
export const formatMonth = (ym: string) => monthFmt.format(new Date(`${ym}-01T00:00:00Z`))
/** Label periode chart dari tanggal "YYYY-MM-DD" (tanpa zona). */
export const formatPeriod = (d: string, groupBy: "day" | "week" | "month") =>
  groupBy === "month" ? shortMonthFmt.format(new Date(`${d}T00:00:00Z`)) : shortDayFmt.format(new Date(`${d}T00:00:00Z`))

/** Tanggal (YYYY-MM-DD) di zona Jakarta untuk sebuah instant. */
export function jakartaDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
}

/** "YYYY-MM" bulan ini di Jakarta. */
export const jakartaMonth = (d: Date = new Date()) => jakartaDate(d).slice(0, 7)

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function addMonths(ym: string, months: number): string {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + months, 1))
  return d.toISOString().slice(0, 7)
}

/** Hari terakhir bulan "YYYY-MM". */
export function monthEnd(ym: string): string {
  return addDays(`${addMonths(ym, 1)}-01`, -1)
}

/** Nilai untuk <input type="datetime-local"> di zona Jakarta (WIB = UTC+7, tanpa DST). */
export function toJakartaLocalInput(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000)
  return d.toISOString().slice(0, 16)
}

/** Kebalikan toJakartaLocalInput: "2026-11-21T19:30" (WIB) -> ISO UTC. */
export function fromJakartaLocalInput(local: string): string {
  return new Date(`${local}:00+07:00`).toISOString()
}

export const ACCOUNT_TYPE_LABEL = { bank: "Bank", ewallet: "E-wallet", cash: "Tunai" } as const
export const TX_TYPE_LABEL = { income: "Pemasukan", expense: "Pengeluaran", transfer: "Transfer" } as const
