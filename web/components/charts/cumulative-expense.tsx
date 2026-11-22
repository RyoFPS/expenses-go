"use client"

import { CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { cumulativeExpenses } from "@/lib/expense-charts"
import { formatCompact, formatMonth, formatRupiah } from "@/lib/format"
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

  const days = Math.max(currentTotals.length, previousTotals.length, 1)
  const config = {
    current: { label: "Bulan ini", color: "var(--expense)" },
    previous: {
      label: formatMonth(previousMonth),
      color: "var(--muted-foreground)",
    },
  } satisfies ChartConfig
  const rows = Array.from({ length: days }, (_, index) => ({
    day: index + 1,
    current: currentTotals[index] ?? null,
    previous: previousTotals[index] ?? null,
  }))

  return (
    <ChartContainer config={config} className="h-44 w-full md:h-52">
      <LineChart
        data={rows}
        margin={{ left: 0, right: 8, top: 8 }}
        accessibilityLayer
      >
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={58}
          tickFormatter={formatCompact}
          fontSize={11}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(day) => `Hari ${day}`}
              formatter={(value) => formatRupiah(Number(value))}
            />
          }
        />
        <Line
          dataKey="current"
          type="linear"
          stroke="var(--color-current)"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 3 }}
          connectNulls={false}
        />
        <Line
          dataKey="previous"
          type="linear"
          stroke="var(--color-previous)"
          strokeWidth={2}
          strokeDasharray="4 3"
          dot={false}
          activeDot={false}
          connectNulls={false}
        />
        <Legend content={<ChartLegendContent />} />
      </LineChart>
    </ChartContainer>
  )
}
