"use client"

// Form tambah cepat dipisah & dimuat lazy (zod + react-hook-form tidak ikut bundle awal setiap halaman).
import { zodResolver } from "@hookform/resolvers/zod"
import { ClockIcon } from "@phosphor-icons/react"
import Link from "next/link"
import * as React from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "@/lib/toast"
import { z } from "zod"

import { OptionSelect } from "@/components/option-select"
import { pickDefaultAccount } from "@/components/quick-add-default"
import { Button } from "@/components/ui/button"
import { DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { formatRupiah, formatRupiahInput, fromJakartaLocalInput, parseRupiahInput, toJakartaLocalInput } from "@/lib/format"
import { useAccounts, useCategories, useCreateTransaction } from "@/lib/queries"
import { cn } from "@/lib/utils"

const LAST_ACCOUNT_KEY = "quickadd.accountId"

const schema = z.object({
  type: z.enum(["expense", "income"]),
  amount: z.string().refine((v) => parseRupiahInput(v) !== null, "Isi nominal lebih dari 0"),
  accountId: z.string().min(1, "Pilih akun"),
  categoryId: z.string(),
  note: z.string().max(1000),
  occurredAt: z.string(), // "" = sekarang
})
type FormValues = z.infer<typeof schema>

function readLastAccount(): string | null {
  try {
    return window.localStorage.getItem(LAST_ACCOUNT_KEY)
  } catch {
    return null
  }
}

export default function QuickAddForm({ onDone }: { onDone: () => void }) {
  const accounts = useAccounts()
  const categories = useCategories()
  const create = useCreateTransaction()
  const amountRef = React.useRef<HTMLInputElement | null>(null)
  const [showTime, setShowTime] = React.useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: "expense", amount: "", accountId: "", categoryId: "", note: "", occurredAt: "" },
  })
  const type = useWatch({ control: form.control, name: "type" })
  const amountPreview = parseRupiahInput(useWatch({ control: form.control, name: "amount" }))

  // Isi akun default setelah daftar akun termuat.
  React.useEffect(() => {
    if (accounts.data && !form.getValues("accountId")) {
      form.setValue("accountId", pickDefaultAccount(accounts.data, readLastAccount()))
    }
  }, [accounts.data, form])

  React.useEffect(() => {
    const t = setTimeout(() => amountRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  const activeAccounts = (accounts.data ?? []).filter((a) => a.is_active)
  const typeCategories = (categories.data ?? []).filter((c) => c.type === type)

  const onSubmit = form.handleSubmit(async (v) => {
    await create.mutateAsync({
      account_id: v.accountId,
      type: v.type,
      amount: parseRupiahInput(v.amount)!,
      category_id: v.categoryId || null,
      note: v.note.trim() || null,
      occurred_at: v.occurredAt ? fromJakartaLocalInput(v.occurredAt) : undefined,
    })
    try {
      window.localStorage.setItem(LAST_ACCOUNT_KEY, v.accountId)
    } catch {
      /* abaikan: penyimpanan lokal tidak tersedia */
    }
    toast.success(`${v.type === "expense" ? "Pengeluaran" : "Pemasukan"} ${formatRupiah(parseRupiahInput(v.amount)!)} tersimpan`)
    onDone()
  })

  if (accounts.isSuccess && activeAccounts.length === 0) {
    return (
      <div className="flex flex-col gap-3 p-6 text-center">
        <DrawerTitle>Belum ada akun</DrawerTitle>
        <DrawerDescription>Buat akun (mis. &quot;Tunai&quot;) dulu sebelum mencatat transaksi.</DrawerDescription>
        <Button render={<Link href="/akun" />} onClick={onDone}>
          Buat akun
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 overflow-y-auto px-5 pb-5" noValidate>
      <DrawerHeader className="px-0">
        <DrawerTitle>Catat transaksi</DrawerTitle>
        <DrawerDescription className="sr-only">Isi nominal lalu simpan. Kolom lain opsional.</DrawerDescription>
      </DrawerHeader>

      <Controller
        control={form.control}
        name="type"
        render={({ field }) => (
          <div role="radiogroup" aria-label="Jenis transaksi" className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
            {(["expense", "income"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={field.value === t}
                onClick={() => {
                  field.onChange(t)
                  form.setValue("categoryId", "")
                }}
                className={cn(
                  "rounded-xl py-2 text-sm font-medium transition-colors",
                  field.value === t
                    ? cn("bg-background shadow-sm", t === "expense" ? "text-expense" : "text-income")
                    : "text-muted-foreground"
                )}
              >
                {t === "expense" ? "Pengeluaran" : "Pemasukan"}
              </button>
            ))}
          </div>
        )}
      />

      <Controller
        control={form.control}
        name="amount"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="qa-amount">Nominal</FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-2xl text-muted-foreground">
                Rp
              </span>
              <Input
                id="qa-amount"
                ref={(el) => {
                  field.ref(el)
                  amountRef.current = el
                }}
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="done"
                placeholder="0"
                value={field.value}
                onChange={(e) => field.onChange(formatRupiahInput(e.target.value))}
                onBlur={field.onBlur}
                aria-invalid={fieldState.invalid}
                className={cn(
                  "money h-16 rounded-2xl pl-14 text-3xl font-semibold md:text-3xl",
                  type === "expense" ? "text-expense" : "text-income"
                )}
              />
            </div>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {typeCategories.length > 0 && (
        <Controller
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">
                Kategori <span className="font-normal text-muted-foreground">(opsional)</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {typeCategories.map((c) => {
                  const selected = field.value === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => field.onChange(selected ? "" : c.id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm transition-colors",
                        selected ? "border-foreground bg-foreground text-background" : "hover:bg-muted"
                      )}
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Controller
          control={form.control}
          name="accountId"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="qa-account">Akun</FieldLabel>
              <OptionSelect
                id="qa-account"
                value={field.value}
                onChange={field.onChange}
                options={activeAccounts.map((a) => ({ value: a.id, label: a.name }))}
                placeholder={accounts.isLoading ? "Memuat…" : "Pilih akun"}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Field>
          <FieldLabel htmlFor="qa-note">Catatan</FieldLabel>
          <Input id="qa-note" placeholder="mis. Bakso" className="h-10" {...form.register("note")} />
        </Field>
      </div>

      {showTime ? (
        <Field>
          <FieldLabel htmlFor="qa-time">Waktu (WIB)</FieldLabel>
          <Input id="qa-time" type="datetime-local" className="h-10" {...form.register("occurredAt")} />
        </Field>
      ) : (
        <button
          type="button"
          onClick={() => {
            form.setValue("occurredAt", toJakartaLocalInput(new Date().toISOString()))
            setShowTime(true)
          }}
          className="flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <ClockIcon className="size-4" /> Sekarang · ubah waktu
        </button>
      )}

      <Button type="submit" size="lg" className="h-12 text-base" disabled={create.isPending}>
        {create.isPending ? "Menyimpan…" : amountPreview ? `Simpan ${formatRupiah(amountPreview)}` : "Simpan"}
      </Button>
    </form>
  )
}
