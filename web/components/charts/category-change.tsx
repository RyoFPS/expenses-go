"use client"

import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
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

  const config = {
    current: { label: formatMonth(current.month), color: "var(--expense)" },
    previous: {
      label: formatMonth(previous.month),
      color: "var(--muted-foreground)",
    },
  } satisfies ChartConfig

  return (
    <figure>
      <ChartContainer
        config={config}
        className="w-full"
        style={{ height: Math.max(220, rows.length * 54) }}
      >
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ left: 0, right: 8 }}
          barCategoryGap={10}
          accessibilityLayer
        >
          <CartesianGrid horizontal={false} />
          <XAxis type="number" hide />
          <YAxis
            dataKey="name"
            type="category"
            tickLine={false}
            axisLine={false}
            width={116}
            interval={0}
            fontSize={11}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(_label, payload) => {
                  const row = payload?.[0]?.payload as
                    (typeof rows)[number] | undefined
                  if (!row) return null
                  const change = row.current - row.previous
                  const direction =
                    change > 0 ? "Naik" : change < 0 ? "Turun" : "Tetap"
                  return `${row.name}: ${direction} ${formatRupiah(Math.abs(change))}`
                }}
                formatter={(value) => formatRupiah(Number(value))}
              />
            }
          />
          <Bar
            dataKey="current"
            fill="var(--color-current)"
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
          />
          <Bar
            dataKey="previous"
            fill="var(--color-previous)"
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
          />
          <Legend content={<ChartLegendContent />} />
        </BarChart>
      </ChartContainer>
      <figcaption className="mt-2 text-xs text-muted-foreground">
        Biaya transfer tidak termasuk rincian kategori.
      </figcaption>
    </figure>
  )
}
