"use client"

import {
  ArrowDownLeftIcon,
  ArrowsLeftRightIcon,
  ArrowUpRightIcon,
  BellRingingIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import Link from "next/link"

import { useLookups } from "@/components/common"
import { Money } from "@/components/money"
import { formatDateTime } from "@/lib/format"
import type { Transaction } from "@/lib/types"
import { cn } from "@/lib/utils"

const ICON = {
  income: ArrowDownLeftIcon,
  expense: ArrowUpRightIcon,
  transfer: ArrowsLeftRightIcon,
} as const
const TONE = {
  income: "bg-income/12 text-income",
  expense: "bg-expense/12 text-expense",
  transfer: "bg-transfer/12 text-transfer",
} as const

export function txTitle(
  tx: Transaction,
  accountName: (id: string | null) => string
): string {
  if (tx.type === "transfer")
    return `${accountName(tx.account_id)} → ${accountName(tx.to_account_id)}`
  return (
    tx.merchant ||
    tx.note ||
    (tx.type === "income" ? "Pemasukan" : "Pengeluaran")
  )
}

/** Satu baris transaksi, bisa diklik menuju halaman detail. */
export function TransactionRow({
  tx,
  trailing,
}: {
  tx: Transaction
  trailing?: React.ReactNode
}) {
  const { accountName, category } = useLookups()
  const Icon = ICON[tx.type]
  const cat = category(tx.category_id)
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-2xl",
          TONE[tx.type]
        )}
        aria-hidden
      >
        <Icon weight="bold" className="size-5" />
      </span>
      <Link
        prefetch={false}
        href={`/transaksi/${tx.id}`}
        className="min-w-0 flex-1 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <p className="flex items-center gap-1.5 truncate font-medium">
          <span className="truncate">{txTitle(tx, accountName)}</span>
          {tx.needs_review && (
            <WarningCircleIcon
              weight="fill"
              className="size-4 shrink-0 text-expense"
              aria-label="Perlu review"
            />
          )}
          {tx.source === "notification" && (
            <BellRingingIcon
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-label="Dari notifikasi"
            />
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {formatDateTime(tx.occurred_at)}
          {tx.type !== "transfer" && ` · ${accountName(tx.account_id)}`}
          {cat && ` · ${cat.name}`}
        </p>
      </Link>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Money
          value={tx.amount}
          type={tx.type}
          signed
          className="text-sm font-semibold"
        />
        {tx.fee > 0 && (
          <span className="text-[11px] text-muted-foreground">
            biaya {tx.fee.toLocaleString("id-ID")}
          </span>
        )}
        {trailing}
      </div>
    </div>
  )
}
