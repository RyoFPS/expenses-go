"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import dynamic from "next/dynamic"
import * as React from "react"

import { QuickAddProvider } from "@/components/quick-add"
import { ThemeProvider } from "@/components/theme-provider"
import { ApiError } from "@/lib/api"

// Toaster dimuat setelah hidrasi (sonner tidak ikut bundle awal).
const Toaster = dynamic(() => import("@/components/ui/sonner").then((m) => m.Toaster), { ssr: false })

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            // Error 4xx (mis. 401/404) tidak perlu dicoba ulang.
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
          },
        },
      })
  )
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <QuickAddProvider>{children}</QuickAddProvider>
        <Toaster position="top-center" richColors={false} />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
