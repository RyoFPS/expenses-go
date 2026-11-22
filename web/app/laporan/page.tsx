"use client"

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react"
import * as React from "react"

import {
  LazyCategoryBars,
  LazyCategoryChange,
  LazyCashflowChart,
} from "@/components/charts/lazy"
import { ErrorNote, ListSkeleton, PageHeader } from "@/components/common"
import { Money } from "@/components/money"
import { MonthPicker } from "@/components/month-picker"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { addMonths, formatMonth, jakartaMonth, monthEnd } from "@/lib/format"
import { useCashflow, useSummary } from "@/lib/queries"

export default function ReportsPage() {
  const current = jakartaMonth()
  const [month, setMonth] = React.useState(current)
  const summary = useSummary(month)
  const previousSummary = useSummary(addMonths(month, -1))
  const daily = useCashflow(`${month}-01`, monthEnd(month), "day")
  const trend = useCashflow(
    `${addMonths(month, -11)}-01`,
    monthEnd(month),
    "month"
  )

  return (
    <>
      <PageHeader
        title="Laporan"
        actions={
          <div className="flex w-full items-center gap-1 sm:w-auto">
            <Button
              variant="outline"
              size="icon"
              aria-label="Bulan sebelumnya"
              onClick={() => setMonth((m) => addMonths(m, -1))}
            >
              <CaretLeftIcon />
            </Button>
            <MonthPicker value={month} max={current} onChange={setMonth} />
            <Button
              variant="outline"
              size="icon"
              aria-label="Bulan berikutnya"
              disabled={month >= current}
              onClick={() => setMonth((m) => addMonths(m, 1))}
            >
              <CaretRightIcon />
            </Button>
          </div>
        }
      />

      <h2 className="sr-only">{formatMonth(month)}</h2>
      <section
        className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4"
        aria-label={`Ringkasan ${formatMonth(month)}`}
      >
        {summary.isLoading ? (
          Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-3xl" />
          ))
        ) : summary.isError ? (
          <div className="col-span-full">
            <ErrorNote error={summary.error} />
          </div>
        ) : (
          summary.data && (
            <>
              <Stat
                label="Pemasukan"
                value={summary.data.income}
                type="income"
              />
              <Stat
                label="Pengeluaran"
                value={summary.data.expense}
                type="expense"
              />
              <Stat
                label="Selisih"
                value={summary.data.net}
                type={summary.data.net >= 0 ? "income" : "expense"}
              />
              <Stat
                label="Biaya transfer"
                value={summary.data.fees}
                type="neutral"
              />
            </>
          )
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Harian · {formatMonth(month)}</CardTitle>
          </CardHeader>
          <CardContent>
            {daily.data ? (
              <LazyCashflowChart
                data={daily.data}
                className="aspect-video w-full"
              />
            ) : (
              <Skeleton className="aspect-video w-full" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tren 12 bulan</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.data ? (
              <LazyCashflowChart
                data={trend.data}
                className="aspect-video w-full"
              />
            ) : (
              <Skeleton className="aspect-video w-full" />
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Perubahan pengeluaran per kategori</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.isError ? (
              <ErrorNote error={summary.error} />
            ) : previousSummary.isError ? (
              <ErrorNote error={previousSummary.error} />
            ) : summary.data && previousSummary.data ? (
              <LazyCategoryChange
                current={summary.data}
                previous={previousSummary.data}
              />
            ) : (
              <ListSkeleton rows={5} />
            )}
          </CardContent>
        </Card>
        {(["expense", "income"] as const).map((type) => (
          <Card key={type}>
            <CardHeader>
              <CardTitle>
                {type === "expense" ? "Pengeluaran" : "Pemasukan"} per kategori
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary.isLoading ? (
                <ListSkeleton rows={3} />
              ) : summary.data?.by_category.some((c) => c.type === type) ? (
                <LazyCategoryBars
                  items={summary.data.by_category}
                  type={type}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Tidak ada data.</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}

function Stat({
  label,
  value,
  type,
}: {
  label: string
  value: number
  type: "income" | "expense" | "neutral"
}) {
  return (
    <div className="flex flex-col gap-1 rounded-3xl bg-card p-4 ring-1 ring-foreground/5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Money
        value={value}
        type={type}
        className="text-lg font-semibold md:text-xl"
      />
    </div>
  )
}
