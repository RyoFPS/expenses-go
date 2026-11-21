"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatCompact, formatPeriod, formatRupiah } from "@/lib/format"
import type { Cashflow } from "@/lib/types"

const config = {
  income: { label: "Masuk", color: "var(--income)" },
  expense: { label: "Keluar", color: "var(--expense)" },
} satisfies ChartConfig

export default function CashflowChart({ data, className }: { data: Cashflow; className?: string }) {
  const rows = data.points.map((p) => ({ ...p, label: formatPeriod(p.period, data.group_by) }))
  return (
    <ChartContainer config={config} className={className}>
      <BarChart data={rows} margin={{ left: 0, right: 4, top: 8 }} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} width={58} tickFormatter={formatCompact} fontSize={11} />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent formatter={(v, name) => `${config[name as keyof typeof config]?.label ?? name}: ${formatRupiah(Number(v))}`} />}
        />
        <Bar dataKey="income" fill="var(--color-income)" radius={[6, 6, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expense" fill="var(--color-expense)" radius={[6, 6, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartContainer>
  )
}
