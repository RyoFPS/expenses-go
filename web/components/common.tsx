"use client"

import type { Icon } from "@phosphor-icons/react"
import * as React from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { useAccounts, useCategories } from "@/lib/queries"
import type { Account, Category } from "@/lib/types"
import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>}
    </div>
  )
}

export function EmptyState({
  icon: IconCmp,
  title,
  description,
  action,
  className,
}: {
  icon: Icon
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-3xl border border-dashed px-6 py-10 text-center", className)}>
      <IconCmp className="size-10 text-muted-foreground" weight="duotone" aria-hidden />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-2xl" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  return (
    <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {error instanceof Error ? error.message : "Gagal memuat data."}
    </p>
  )
}

/** Peta id -> akun/kategori untuk menampilkan nama di daftar transaksi. */
export function useLookups() {
  const accounts = useAccounts()
  const categories = useCategories()
  return React.useMemo(() => {
    const acc = new Map<string, Account>((accounts.data ?? []).map((a) => [a.id, a]))
    const cat = new Map<string, Category>((categories.data ?? []).map((c) => [c.id, c]))
    return {
      accounts: accounts.data ?? [],
      categories: categories.data ?? [],
      accountName: (id: string | null) => (id ? (acc.get(id)?.name ?? "—") : "—"),
      category: (id: string | null) => (id ? cat.get(id) : undefined),
    }
  }, [accounts.data, categories.data])
}
