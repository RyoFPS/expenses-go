"use client"

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatCompact, formatRupiah } from "@/lib/format"
import type { MonthlySummary } from "@/lib/types"

export function CategoryBars({
  items,
  type,
  limit,
}: {
  items: MonthlySummary["by_category"]
  type: "income" | "expense"
  limit?: number
}) {
  const rows = items.filter((item) => item.type === type)
  const shown = limit ? rows.slice(0, limit) : rows
  if (!shown.length) return null

  const total = rows.reduce((sum, row) => sum + row.total, 0)
  const config = {
    total: {
      label: type === "expense" ? "Pengeluaran" : "Pemasukan",
      color: type === "expense" ? "var(--expense)" : "var(--income)",
    },
  } satisfies ChartConfig

  return (
    <ChartContainer
      config={config}
      className="w-full"
      style={{ height: Math.max(160, shown.length * 42) }}
    >
      <BarChart
        data={shown.map((row) => ({
          ...row,
          percent: Math.round((row.total / Math.max(total, 1)) * 100),
        }))}
        layout="vertical"
        margin={{ left: 0, right: 44 }}
        barCategoryGap={10}
        accessibilityLayer
      >
        <CartesianGrid horizontal={false} />
        <XAxis type="number" hide domain={[0, (max: number) => max * 1.5]} />
        <YAxis
          dataKey="name"
          type="category"
          tickLine={false}
          axisLine={false}
          width={104}
          interval={0}
          fontSize={11}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) =>
                `${formatRupiah(Number(value))} (${item.payload.percent}%)`
              }
            />
          }
        />
        <Bar
          dataKey="total"
          fill="var(--color-total)"
          radius={[0, 4, 4, 0]}
          maxBarSize={18}
        >
          <LabelList
            dataKey="total"
            position="right"
            formatter={(value) => formatCompact(Number(value))}
            fontSize={10}
            fill="var(--muted-foreground)"
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
