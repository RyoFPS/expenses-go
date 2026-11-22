"use client"

import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatCompact, formatPeriod, formatRupiah } from "@/lib/format"
import type { Cashflow } from "@/lib/types"

const config = {
  income: { label: "Masuk", color: "var(--income)" },
  expense: { label: "Keluar", color: "var(--expense)" },
} satisfies ChartConfig

export function MiniCashflow({ data }: { data: Cashflow }) {
  const rows = data.points.map((point) => ({
    ...point,
    label: formatPeriod(point.period, data.group_by),
  }))
  const ticks = [
    ...new Set(
      [
        rows[0]?.label,
        rows[Math.floor(rows.length / 2)]?.label,
        rows.at(-1)?.label,
      ].filter((label): label is string => Boolean(label))
    ),
  ]
  const totalIn = data.points.reduce((sum, point) => sum + point.income, 0)
  const totalOut = data.points.reduce((sum, point) => sum + point.expense, 0)

  return (
    <figure
      aria-label={`Arus kas ${data.points.length} hari: masuk ${formatRupiah(totalIn)}, keluar ${formatRupiah(totalOut)}`}
    >
      <ChartContainer config={config} className="h-44 w-full">
        <BarChart
          data={rows}
          margin={{ left: 0, right: 4, top: 8 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            ticks={ticks}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={formatCompact}
            fontSize={10}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                formatter={(value, name) =>
                  `${config[name as keyof typeof config]?.label ?? name}: ${formatRupiah(Number(value))}`
                }
              />
            }
          />
          <Bar
            dataKey="income"
            fill="var(--color-income)"
            radius={[2, 2, 0, 0]}
            maxBarSize={6}
          />
          <Bar
            dataKey="expense"
            fill="var(--color-expense)"
            radius={[2, 2, 0, 0]}
            maxBarSize={6}
          />
          <Legend content={<ChartLegendContent />} />
        </BarChart>
      </ChartContainer>
    </figure>
  )
}
