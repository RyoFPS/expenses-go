"use client"

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatCompact, formatRupiah, monthEnd } from "@/lib/format"
import type { MonthlySummary } from "@/lib/types"

export function CategoryBars({
  items,
  type,
  month,
  limit,
}: {
  items: MonthlySummary["by_category"]
  type: "income" | "expense"
  month?: string
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
  const transactionHref = (categoryId: string) => {
    if (!month) return "/transaksi"
    const params = new URLSearchParams({
      kategori: categoryId,
      tipe: type,
      dari: `${month}-01`,
      sampai: monthEnd(month),
    })
    return `/transaksi?${params}`
  }

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
          tick={({ x, y, payload }) => {
            const row = shown.find((item) => item.name === payload.value)
            const text = (
              <text
                x={x}
                y={y}
                dy={4}
                textAnchor="end"
                fill="var(--muted-foreground)"
                fontSize={11}
              >
                {payload.value}
              </text>
            )
            return month && row?.category_id ? (
              <a
                href={transactionHref(row.category_id)}
                aria-label={`Lihat transaksi kategori ${row.name}`}
                className="cursor-pointer underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {text}
              </a>
            ) : text
          }}
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
          cursor={month ? "pointer" : undefined}
          onClick={(bar) => {
            const categoryId = bar.payload.category_id
            if (month && categoryId) window.location.assign(transactionHref(categoryId))
          }}
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
