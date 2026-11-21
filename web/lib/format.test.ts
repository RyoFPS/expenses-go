import { describe, expect, it } from "vitest"

import { errorMessage } from "@/lib/api"
import {
  addMonths,
  formatCompact,
  formatRupiah,
  formatRupiahInput,
  fromJakartaLocalInput,
  jakartaDate,
  jakartaMonth,
  monthEnd,
  parseRupiahInput,
  toJakartaLocalInput,
} from "@/lib/format"
import { pickDefaultAccount } from "@/components/quick-add-default"
import type { Account } from "@/lib/types"

// Normalisasi spasi tak-putus & minus Unicode agar ekspektasi mudah dibaca.
const nbsp = (s: string) => s.replace(/ /g, " ").replace(/−/g, "-")

describe("formatRupiah", () => {
  it("memakai format Indonesia tanpa desimal (PRD §13: Rp 1.500.000)", () => {
    expect(nbsp(formatRupiah(1_500_000))).toBe("Rp 1.500.000")
    expect(nbsp(formatRupiah(0))).toBe("Rp 0")
    expect(nbsp(formatRupiah(999))).toBe("Rp 999")
  })
  it("tidak bisa terpotong baris (nbsp + minus Unicode)", () => {
    expect(formatRupiah(-25_000)).toBe("−Rp 25.000")
    expect(formatRupiah(1_000)).not.toMatch(/ /)
  })
  it("tanda negatif & opsi plus", () => {
    expect(nbsp(formatRupiah(-25_000))).toBe("-Rp 25.000")
    expect(nbsp(formatRupiah(25_000, { sign: true }))).toBe("+Rp 25.000")
    expect(nbsp(formatRupiah(0, { sign: true }))).toBe("Rp 0")
  })
  it("ringkas untuk sumbu chart", () => {
    expect(formatCompact(1_500_000)).toBe("1,5 jt")
    expect(formatCompact(25_000)).toBe("25 rb")
    expect(nbsp(formatCompact(-2_000_000_000))).toBe("-2 M")
    expect(formatCompact(500)).toBe("500")
  })
})

describe("input nominal", () => {
  it.each([
    ["25.000", 25_000],
    ["25000", 25_000],
    ["25,000", 25_000],
    ["Rp 1.500.000", 1_500_000],
    [" 7 500 ", 7_500],
  ])("parseRupiahInput(%s) = %d", (raw, n) => expect(parseRupiahInput(raw)).toBe(n))

  it.each(["", "0", "abc", "-5.000", "12a"])("parseRupiahInput(%s) = null", (raw) => {
    expect(parseRupiahInput(raw)).toBeNull()
  })

  it("memformat sambil mengetik", () => {
    expect(formatRupiahInput("25000")).toBe("25.000")
    expect(formatRupiahInput("Rp1.500.000x")).toBe("1.500.000")
    expect(formatRupiahInput("007")).toBe("7")
    expect(formatRupiahInput("")).toBe("")
  })
})

describe("waktu WIB", () => {
  it("tanggal & bulan Jakarta melewati batas hari UTC", () => {
    const d = new Date("2026-11-30T17:30:00Z") // 1 Des 00:30 WIB
    expect(jakartaDate(d)).toBe("2026-12-01")
    expect(jakartaMonth(d)).toBe("2026-12")
  })
  it("datetime-local <-> ISO dalam WIB", () => {
    expect(toJakartaLocalInput("2026-11-21T12:30:00Z")).toBe("2026-11-21T19:30")
    expect(fromJakartaLocalInput("2026-11-21T19:30")).toBe("2026-11-21T12:30:00.000Z")
    expect(fromJakartaLocalInput(toJakartaLocalInput("2026-01-01T00:00:00Z"))).toBe("2026-01-01T00:00:00.000Z")
  })
  it("aritmetika bulan", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01")
    expect(addMonths("2026-01", -1)).toBe("2025-12")
    expect(monthEnd("2026-02")).toBe("2026-02-28")
    expect(monthEnd("2028-02")).toBe("2028-02-29")
  })
})

describe("errorMessage", () => {
  it("detail string dari backend", () => {
    expect(errorMessage({ detail: "Nama akun sudah dipakai" }, 409)).toBe("Nama akun sudah dipakai")
  })
  it("error validasi FastAPI per field", () => {
    const body = { detail: [{ loc: ["body", "amount"], msg: "Input should be greater than 0" }] }
    expect(errorMessage(body, 422)).toBe("amount: Input should be greater than 0")
  })
  it("fallback", () => {
    expect(errorMessage(null, 401)).toMatch(/Sesi login/)
    expect(errorMessage(null, 500)).toBe("Permintaan gagal (500)")
  })
})

describe("akun default tambah cepat", () => {
  const acc = (id: string, type: Account["type"], is_active = true): Account => ({
    id,
    name: id,
    type,
    is_active,
    package_name: null,
    opening_balance: 0,
    created_at: "",
    balance: 0,
  })
  const accounts = [acc("bca", "bank"), acc("tunai", "cash"), acc("lama", "cash", false)]

  it("terakhir dipakai jika masih aktif", () => expect(pickDefaultAccount(accounts, "bca")).toBe("bca"))
  it("lalu akun tunai", () => expect(pickDefaultAccount(accounts, "lama")).toBe("tunai"))
  it("lalu akun aktif pertama", () => expect(pickDefaultAccount([acc("bca", "bank")], null)).toBe("bca"))
  it("kosong jika tidak ada akun aktif", () => expect(pickDefaultAccount([acc("x", "cash", false)], null)).toBe(""))
})
