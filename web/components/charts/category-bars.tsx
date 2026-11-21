import { Money } from "@/components/money"
import type { MonthlySummary } from "@/lib/types"

/** Daftar bar horizontal per kategori (HTML biasa: ringan & terbaca screen reader). */
export function CategoryBars({
  items,
  type,
  limit,
}: {
  items: MonthlySummary["by_category"]
  type: "income" | "expense"
  limit?: number
}) {
  const rows = items.filter((r) => r.type === type)
  const shown = limit ? rows.slice(0, limit) : rows
  const max = Math.max(1, ...rows.map((r) => r.total))
  const total = rows.reduce((s, r) => s + r.total, 0)
  return (
    <ul className="flex flex-col gap-3">
      {shown.map((r) => (
        <li key={r.category_id ?? "none"} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{r.name}</span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span className="text-xs text-muted-foreground">{Math.round((r.total / Math.max(total, 1)) * 100)}%</span>
              <Money value={r.total} type="neutral" className="font-medium" />
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className={type === "expense" ? "h-full rounded-full bg-expense" : "h-full rounded-full bg-income"}
              style={{ width: `${(r.total / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
