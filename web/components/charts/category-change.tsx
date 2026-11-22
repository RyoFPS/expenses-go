import { Money } from "@/components/money"
import { changedExpenseCategories } from "@/lib/expense-charts"
import { formatMonth, formatRupiah } from "@/lib/format"
import type { MonthlySummary } from "@/lib/types"

export function CategoryChange({
  current,
  previous,
}: {
  current: MonthlySummary
  previous: MonthlySummary
}) {
  const rows = changedExpenseCategories(current, previous)
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Tidak ada pengeluaran kategori pada kedua bulan.
      </p>
    )

  const max = Math.max(1, ...rows.flatMap((row) => [row.current, row.previous]))

  return (
    <figure className="flex flex-col gap-4">
      <div
        className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"
        aria-hidden
      >
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-expense" />
          {formatMonth(current.month)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-muted-foreground" />
          {formatMonth(previous.month)}
        </span>
      </div>
      <ul className="flex flex-col gap-4">
        {rows.map((row) => {
          const change = row.current - row.previous
          return (
            <li key={row.id ?? "none"} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-medium">{row.name}</span>
                <span
                  className={
                    change > 0
                      ? "text-expense"
                      : change < 0
                        ? "text-income"
                        : "text-muted-foreground"
                  }
                >
                  {change > 0 ? "Naik" : change < 0 ? "Turun" : "Tetap"}{" "}
                  {formatRupiah(Math.abs(change))}
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-xs">
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full bg-expense"
                    style={{ width: `${(row.current / max) * 100}%` }}
                  />
                </div>
                <span>
                  <span className="sr-only">
                    {formatMonth(current.month)}:{" "}
                  </span>
                  <Money value={row.current} type="neutral" />
                </span>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full bg-muted-foreground"
                    style={{ width: `${(row.previous / max) * 100}%` }}
                  />
                </div>
                <span>
                  <span className="sr-only">
                    {formatMonth(previous.month)}:{" "}
                  </span>
                  <Money value={row.previous} type="neutral" />
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      <figcaption className="text-xs text-muted-foreground">
        Biaya transfer tidak termasuk rincian kategori.
      </figcaption>
    </figure>
  )
}
