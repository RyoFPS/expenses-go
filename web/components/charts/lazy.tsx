"use client"

import dynamic from "next/dynamic"
import * as React from "react"

import { Skeleton } from "@/components/ui/skeleton"
import type { Cashflow, MonthlySummary } from "@/lib/types"

const CashflowChart = dynamic(
  () => import("@/components/charts/cashflow-chart"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-2xl" />,
  }
)
const MiniCashflowChart = dynamic(
  () =>
    import("@/components/charts/mini-cashflow").then(
      (module) => module.MiniCashflow
    ),
  { ssr: false }
)
const CumulativeExpenseChart = dynamic(
  () =>
    import("@/components/charts/cumulative-expense").then(
      (module) => module.CumulativeExpense
    ),
  { ssr: false }
)
const CategoryBarsChart = dynamic(
  () =>
    import("@/components/charts/category-bars").then(
      (module) => module.CategoryBars
    ),
  { ssr: false }
)
const CategoryChangeChart = dynamic(
  () =>
    import("@/components/charts/category-change").then(
      (module) => module.CategoryChange
    ),
  { ssr: false }
)

function useInView<T extends Element>(rootMargin = "200px") {
  const ref = React.useRef<T | null>(null)
  const [inView, setInView] = React.useState(false)
  React.useEffect(() => {
    const element = ref.current
    if (!element || inView) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [inView, rootMargin])
  return [ref, inView] as const
}

function ChartGate({
  children,
  className,
  skeletonClassName = "h-44 w-full rounded-2xl",
}: {
  children: React.ReactNode
  className?: string
  skeletonClassName?: string
}) {
  const [ref, inView] = useInView<HTMLDivElement>()
  return (
    <div ref={ref} className={className}>
      {inView ? children : <Skeleton className={skeletonClassName} />}
    </div>
  )
}

export function LazyCashflowChart({
  data,
  className,
}: {
  data: Cashflow
  className?: string
}) {
  return (
    <ChartGate
      className={className}
      skeletonClassName="h-full w-full rounded-2xl"
    >
      <CashflowChart data={data} className="h-full w-full" />
    </ChartGate>
  )
}

export function LazyMiniCashflow({ data }: { data: Cashflow }) {
  return (
    <ChartGate>
      <MiniCashflowChart data={data} />
    </ChartGate>
  )
}

export function LazyCumulativeExpense({
  current,
  previous,
  previousMonth,
}: {
  current: Cashflow
  previous: Cashflow
  previousMonth: string
}) {
  return (
    <ChartGate>
      <CumulativeExpenseChart
        current={current}
        previous={previous}
        previousMonth={previousMonth}
      />
    </ChartGate>
  )
}

export function LazyCategoryBars({
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
  return (
    <ChartGate>
      <CategoryBarsChart items={items} type={type} month={month} limit={limit} />
    </ChartGate>
  )
}

export function LazyCategoryChange({
  current,
  previous,
}: {
  current: MonthlySummary
  previous: MonthlySummary
}) {
  return (
    <ChartGate>
      <CategoryChangeChart current={current} previous={previous} />
    </ChartGate>
  )
}
