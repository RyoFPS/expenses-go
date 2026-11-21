"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

export interface Option {
  value: string
  label: string
}

// Base UI menganggap "" sebagai "belum dipilih" (menampilkan placeholder), jadi opsi kosong
// memakai nilai sentinel internal dan diterjemahkan kembali ke "" untuk pemanggil.
const EMPTY = "__empty__"

/** Pembungkus shadcn Select (Base UI). `emptyLabel` menambah opsi untuk nilai "" (mis. "Semua akun"). */
export function OptionSelect({
  value,
  onChange,
  options,
  placeholder = "Pilih…",
  emptyLabel,
  className,
  id,
  "aria-label": ariaLabel,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  /** Jika diisi, tampilkan opsi pertama untuk mengosongkan nilai (mis. "Semua akun"). */
  emptyLabel?: string
  className?: string
  id?: string
  "aria-label"?: string
  disabled?: boolean
}) {
  const items = [...(emptyLabel ? [{ value: EMPTY, label: emptyLabel }] : []), ...options]
  const current = value === "" ? (emptyLabel ? EMPTY : null) : value
  return (
    <Select
      items={items}
      value={current}
      onValueChange={(v) => onChange(v === EMPTY || v == null ? "" : (v as string))}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn("h-10 w-full min-w-0", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
