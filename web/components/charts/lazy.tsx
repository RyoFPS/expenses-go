"use client"

import dynamic from "next/dynamic"
import * as React from "react"

import { Skeleton } from "@/components/ui/skeleton"
import type { Cashflow } from "@/lib/types"

/** Recharts cukup besar: dimuat terpisah, dan baru ketika kartunya terlihat di layar. */
const CashflowChart = dynamic(() => import("@/components/charts/cashflow-chart"), {
  ssr: false,
  loading: () => <Skeleton className="aspect-video w-full rounded-2xl" />,
})

function useInView<T extends Element>(rootMargin = "200px") {
  const ref = React.useRef<T | null>(null)
  const [inView, setInView] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el || inView) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          io.disconnect()
        }
      },
      { rootMargin }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [inView, rootMargin])
  return [ref, inView] as const
}

export function LazyCashflowChart({ data, className }: { data: Cashflow; className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>()
  return (
    <div ref={ref} className={className}>
      {inView ? <CashflowChart data={data} className="h-full w-full" /> : <Skeleton className="h-full w-full rounded-2xl" />}
    </div>
  )
}
