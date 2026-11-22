import type { Cashflow, MonthlySummary } from "@/lib/types"
import { addMonths, monthEnd } from "@/lib/format"

export function previousComparableEnd(today: string): string {
  const previousMonth = addMonths(today.slice(0, 7), -1)
  const day = Math.min(
    Number(today.slice(8)),
    Number(monthEnd(previousMonth).slice(8))
  )
  return `${previousMonth}-${String(day).padStart(2, "0")}`
}

export function cumulativeExpenses(data: Cashflow): number[] {
  let total = 0
  return data.points.map((point) => (total += point.expense))
}

export function changedExpenseCategories(
  current: MonthlySummary,
  previous: MonthlySummary
) {
  const rows = new Map<
    string | null,
    { id: string | null; name: string; current: number; previous: number }
  >()

  for (const item of previous.by_category) {
    if (item.type === "expense")
      rows.set(item.category_id, {
        id: item.category_id,
        name: item.name,
        current: 0,
        previous: item.total,
      })
  }
  for (const item of current.by_category) {
    if (item.type !== "expense") continue
    const row = rows.get(item.category_id)
    if (row) {
      row.name = item.name
      row.current = item.total
    } else {
      rows.set(item.category_id, {
        id: item.category_id,
        name: item.name,
        current: item.total,
        previous: 0,
      })
    }
  }

  return [...rows.values()]
    .sort(
      (a, b) =>
        Math.abs(b.current - b.previous) - Math.abs(a.current - a.previous) ||
        a.name.localeCompare(b.name, "id")
    )
    .slice(0, 5)
}
