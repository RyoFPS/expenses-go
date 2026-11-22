import { describe, expect, it } from "vitest"

import {
  changedExpenseCategories,
  cumulativeExpenses,
  previousComparableEnd,
} from "@/lib/expense-charts"
import type { Cashflow, MonthlySummary } from "@/lib/types"

const flow = (expenses: number[]): Cashflow => ({
  date_from: "2026-11-01",
  date_to: "2026-11-03",
  group_by: "day",
  points: expenses.map((expense, i) => ({
    period: `2026-11-0${i + 1}`,
    income: 0,
    expense,
    net: -expense,
  })),
})

const summary = (
  month: string,
  items: [string | null, string, number][]
): MonthlySummary => ({
  month,
  income: 0,
  expense: items.reduce((total, item) => total + item[2], 0),
  fees: 0,
  net: 0,
  by_category: items.map(([category_id, name, total]) => ({
    category_id,
    name,
    total,
    type: "expense",
  })),
})

describe("grafik perbandingan pengeluaran", () => {
  it("menjumlahkan pengeluaran harian, termasuk hari kosong", () => {
    expect(cumulativeExpenses(flow([10_000, 0, 25_000]))).toEqual([
      10_000, 10_000, 35_000,
    ])
    expect(cumulativeExpenses(flow([]))).toEqual([])
  })

  it("membatasi tanggal pembanding pada akhir bulan sebelumnya", () => {
    expect(previousComparableEnd("2026-11-22")).toBe("2026-10-22")
    expect(previousComparableEnd("2026-03-31")).toBe("2026-02-28")
    expect(previousComparableEnd("2028-03-31")).toBe("2028-02-29")
    expect(previousComparableEnd("2026-01-01")).toBe("2025-12-01")
  })

  it("mencocokkan ID kategori dan menampilkan kategori yang hanya ada pada satu bulan", () => {
    const previous = summary("2026-10", [
      ["food", "Makan lama", 60_000],
      ["gone", "Hilang", 40_000],
      [null, "Tanpa kategori", 20_000],
    ])
    const current = summary("2026-11", [
      ["food", "Makan", 90_000],
      ["new", "Baru", 50_000],
      [null, "Tanpa kategori", 10_000],
    ])
    expect(changedExpenseCategories(current, previous)).toEqual([
      { id: "new", name: "Baru", current: 50_000, previous: 0 },
      { id: "gone", name: "Hilang", current: 0, previous: 40_000 },
      { id: "food", name: "Makan", current: 90_000, previous: 60_000 },
      { id: null, name: "Tanpa kategori", current: 10_000, previous: 20_000 },
    ])
  })
})
