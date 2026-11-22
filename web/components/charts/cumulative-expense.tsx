import { formatCompact, formatMonth, formatRupiah } from "@/lib/format"
import { cumulativeExpenses } from "@/lib/expense-charts"
import type { Cashflow } from "@/lib/types"

export function CumulativeExpense({
  current,
  previous,
  previousMonth,
}: {
  current: Cashflow
  previous: Cashflow
  previousMonth: string
}) {
  const currentTotals = cumulativeExpenses(current)
  const previousTotals = cumulativeExpenses(previous)
  const currentTotal = currentTotals.at(-1) ?? 0
  const previousTotal = previousTotals.at(-1) ?? 0
  if (currentTotal === 0 && previousTotal === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Belum ada pengeluaran pada kedua periode.
      </p>
    )
  }
  const max = Math.max(currentTotal, previousTotal, 1)
  const days = Math.max(currentTotals.length, previousTotals.length, 1)
  const width = 300
  const height = 120
  const line = (totals: number[]) =>
    [
      `0,${height}`,
      ...totals.map(
        (total, index) =>
          `${((index + 1) / days) * width},${height - (total / max) * height}`
      ),
    ].join(" ")

  return (
    <figure className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${width} ${height + 18}`}
        className="h-auto w-full max-w-2xl"
        role="img"
        aria-label={`Pengeluaran kumulatif: bulan ini ${formatRupiah(currentTotal)}, ${formatMonth(previousMonth)} ${formatRupiah(previousTotal)}`}
      >
        <line
          x1={0}
          x2={width}
          y1={height}
          y2={height}
          className="stroke-border"
          strokeWidth={1}
        />
        <text x={0} y={10} className="fill-muted-foreground text-[8px]">
          {formatCompact(max)}
        </text>
        <polyline
          points={line(previousTotals)}
          fill="none"
          stroke="var(--muted-foreground)"
          strokeWidth={2}
          strokeDasharray="4 3"
          strokeLinejoin="round"
        />
        <polyline
          points={line(currentTotals)}
          fill="none"
          stroke="var(--expense)"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        <text
          x={0}
          y={height + 13}
          className="fill-muted-foreground text-[8px]"
        >
          1
        </text>
        <text
          x={width}
          y={height + 13}
          textAnchor="end"
          className="fill-muted-foreground text-[8px]"
        >
          {days}
        </text>
      </svg>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-2 border-expense" aria-hidden />{" "}
          Bulan ini {formatRupiah(currentTotal)}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-0 w-4 border-t-2 border-dashed border-muted-foreground"
            aria-hidden
          />{" "}
          {formatMonth(previousMonth)} {formatRupiah(previousTotal)}
        </span>
        {previousTotals.length < currentTotals.length && (
          <span>
            Garis bulan lalu berakhir tanggal {previousTotals.length}.
          </span>
        )}
      </figcaption>
    </figure>
  )
}
