import { describe, expect, it } from "vitest"

import { transactionsCsv } from "@/lib/transaction-csv"
import type { Transaction } from "@/lib/types"

describe("transactionsCsv", () => {
  it("exports Jakarta dates, integer rupiah, quoted fields, and safe spreadsheet text", () => {
    const tx: Transaction = {
      id: "1",
      account_id: "account",
      to_account_id: null,
      type: "expense",
      amount: 25000,
      fee: 0,
      merchant: "=HYPERLINK(\"x\")",
      note: "lunch, team",
      category_id: null,
      occurred_at: "2026-11-30T17:30:00Z",
      source: "manual",
      raw_notification_id: null,
      counter_raw_notification_id: null,
      needs_review: false,
      created_at: "",
      updated_at: "",
    }

    expect(transactionsCsv([tx], () => "Akun", () => "")).toBe(
      '"Tanggal","Akun","Tipe","Nominal (Rp)","Merchant","Kategori","Catatan","Biaya transfer (Rp)","Akun tujuan"\r\n' +
        '"2026-12-01","Akun","Pengeluaran","25000","\'=HYPERLINK(""x"")","","lunch, team","0",""'
    )
  })
})
