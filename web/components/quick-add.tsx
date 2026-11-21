"use client"

import dynamic from "next/dynamic"
import * as React from "react"

export { pickDefaultAccount } from "@/components/quick-add-default"

// Drawer (Base UI) + form (zod, react-hook-form) tidak ikut bundle awal; di-prefetch saat browser idle.
const loadDrawer = () => import("@/components/quick-add-drawer")
const QuickAddDrawer = dynamic(loadDrawer, { ssr: false })

const QuickAddContext = React.createContext<{ open: () => void } | null>(null)

export function useQuickAdd() {
  const ctx = React.useContext(QuickAddContext)
  if (!ctx) throw new Error("useQuickAdd harus di dalam QuickAddProvider")
  return ctx
}

export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const value = React.useMemo(
    () => ({
      open: () => {
        setMounted(true)
        setOpen(true)
      },
    }),
    []
  )

  React.useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number }
    const prefetch = () => void loadDrawer().then((m) => m.prefetchForm())
    if (w.requestIdleCallback) w.requestIdleCallback(prefetch)
    else setTimeout(prefetch, 2000)
  }, [])

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      {mounted && <QuickAddDrawer open={isOpen} onOpenChange={setOpen} />}
    </QuickAddContext.Provider>
  )
}
