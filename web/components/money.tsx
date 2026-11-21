import { cn } from "@/lib/utils"
import { formatRupiah } from "@/lib/format"
import type { TxType } from "@/lib/types"

const toneClass = {
  income: "text-income",
  expense: "text-expense",
  transfer: "text-transfer",
  neutral: "text-foreground",
} as const

/** Nominal rupiah dengan warna konsisten: hijau pemasukan, merah pengeluaran. */
export function Money({
  value,
  type,
  signed = false,
  className,
}: {
  value: number
  type?: TxType | "neutral"
  signed?: boolean
  className?: string
}) {
  const tone = type ?? (value < 0 ? "expense" : "neutral")
  const shown = signed && type === "expense" ? -Math.abs(value) : value
  return (
    <span className={cn("money whitespace-nowrap", toneClass[tone], className)}>
      {formatRupiah(shown, { sign: signed && type === "income" })}
    </span>
  )
}
