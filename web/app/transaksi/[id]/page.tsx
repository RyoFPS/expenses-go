"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeftIcon, BellRingingIcon, CheckIcon, TrashIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import * as React from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "@/lib/toast"
import { z } from "zod"

import { ErrorNote, ListSkeleton, useLookups } from "@/components/common"
import { Money } from "@/components/money"
import { OptionSelect } from "@/components/option-select"
import { DateTimePicker } from "@/components/date-time-picker"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  TX_TYPE_LABEL,
  formatDateTime,
  formatRupiahInput,
  fromJakartaLocalInput,
  parseRupiahInput,
  toJakartaLocalInput,
} from "@/lib/format"
import { useDeleteTransaction, useMarkReviewed, useTransaction, useUpdateTransaction } from "@/lib/queries"
import type { RawNotification, TransactionDetail, TxType } from "@/lib/types"

const SOURCE_LABEL = { notification: "Notifikasi", manual: "Manual", import: "Impor" } as const

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, isError, error } = useTransaction(id)

  return (
    <div className="flex flex-col gap-4">
      <Link href="/transaksi" className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Transaksi
      </Link>
      {isLoading ? <ListSkeleton rows={4} /> : isError ? <ErrorNote error={error} /> : data && <Detail tx={data} />}
    </div>
  )
}

const schema = z
  .object({
    type: z.enum(["income", "expense", "transfer"]),
    amount: z.string().refine((v) => parseRupiahInput(v) !== null, "Nominal harus lebih dari 0"),
    fee: z.string(),
    accountId: z.string().min(1, "Pilih akun"),
    toAccountId: z.string(),
    categoryId: z.string(),
    merchant: z.string().max(255),
    note: z.string().max(1000),
    occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Isi tanggal dan jam"),
  })
  .superRefine((v, ctx) => {
    if (v.type === "transfer") {
      if (!v.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Pilih akun tujuan" })
      else if (v.toAccountId === v.accountId)
        ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Akun tujuan harus berbeda" })
    }
  })
type FormValues = z.infer<typeof schema>

function toForm(tx: TransactionDetail): FormValues {
  return {
    type: tx.type,
    amount: formatRupiahInput(String(tx.amount)),
    fee: tx.fee ? formatRupiahInput(String(tx.fee)) : "",
    accountId: tx.account_id,
    toAccountId: tx.to_account_id ?? "",
    categoryId: tx.category_id ?? "",
    merchant: tx.merchant ?? "",
    note: tx.note ?? "",
    occurredAt: toJakartaLocalInput(tx.occurred_at),
  }
}

function Detail({ tx }: { tx: TransactionDetail }) {
  const router = useRouter()
  const lookups = useLookups()
  const update = useUpdateTransaction()
  const del = useDeleteTransaction()
  const review = useMarkReviewed()
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toForm(tx) })
  React.useEffect(() => form.reset(toForm(tx)), [tx, form])
  const type = useWatch({ control: form.control, name: "type" })

  const onSubmit = form.handleSubmit(async (v) => {
    await update.mutateAsync({
      id: tx.id,
      type: v.type,
      amount: parseRupiahInput(v.amount)!,
      fee: v.type === "transfer" ? (parseRupiahInput(v.fee) ?? 0) : 0,
      account_id: v.accountId,
      to_account_id: v.type === "transfer" ? v.toAccountId : null,
      category_id: v.type === "transfer" ? null : v.categoryId || null,
      merchant: v.merchant.trim() || null,
      note: v.note.trim() || null,
      occurred_at: fromJakartaLocalInput(v.occurredAt),
    })
    toast.success("Perubahan disimpan")
  })

  const accountOptions = lookups.accounts.map((a) => ({ value: a.id, label: a.name + (a.is_active ? "" : " (nonaktif)") }))

  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <Card>
        <CardHeader className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{TX_TYPE_LABEL[tx.type]}</Badge>
            <Badge variant="outline">{SOURCE_LABEL[tx.source]}</Badge>
            {tx.needs_review && <Badge variant="destructive">Perlu review</Badge>}
          </div>
          <Money value={tx.amount} type={tx.type} signed className="text-3xl font-semibold" />
          <p className="text-sm text-muted-foreground">{formatDateTime(tx.occurred_at)} WIB</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="d-type">Tipe</FieldLabel>
                  <OptionSelect
                    id="d-type"
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v as TxType)
                      form.setValue("categoryId", "")
                    }}
                    options={(Object.keys(TX_TYPE_LABEL) as TxType[]).map((t) => ({ value: t, label: TX_TYPE_LABEL[t] }))}
                  />
                </Field>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={form.control}
                name="amount"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel htmlFor="d-amount">Nominal (Rp)</FieldLabel>
                    <Input
                      id="d-amount"
                      inputMode="numeric"
                      className="money h-10"
                      value={field.value}
                      onChange={(e) => field.onChange(formatRupiahInput(e.target.value))}
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name="occurredAt"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel htmlFor="d-time">Waktu (WIB)</FieldLabel>
                    <DateTimePicker id="d-time" value={field.value} onChange={field.onChange} invalid={fieldState.invalid} />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={form.control}
                name="accountId"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel htmlFor="d-account">{type === "transfer" ? "Dari akun" : "Akun"}</FieldLabel>
                    <OptionSelect id="d-account" value={field.value} onChange={field.onChange} options={accountOptions} />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              {type === "transfer" ? (
                <Controller
                  control={form.control}
                  name="toAccountId"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid || undefined}>
                      <FieldLabel htmlFor="d-to">Ke akun</FieldLabel>
                      <OptionSelect id="d-to" value={field.value} onChange={field.onChange} options={accountOptions} placeholder="Pilih akun tujuan" />
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              ) : (
                <Controller
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor="d-category">Kategori</FieldLabel>
                      <OptionSelect
                        id="d-category"
                        value={field.value}
                        onChange={field.onChange}
                        emptyLabel="Tanpa kategori"
                        options={lookups.categories.filter((c) => c.type === type).map((c) => ({ value: c.id, label: c.name }))}
                      />
                    </Field>
                  )}
                />
              )}
            </div>
            {type === "transfer" && (
              <Controller
                control={form.control}
                name="fee"
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="d-fee">Biaya admin (Rp)</FieldLabel>
                    <Input
                      id="d-fee"
                      inputMode="numeric"
                      className="money h-10"
                      placeholder="0"
                      value={field.value}
                      onChange={(e) => field.onChange(formatRupiahInput(e.target.value))}
                    />
                  </Field>
                )}
              />
            )}
            <Field>
              <FieldLabel htmlFor="d-merchant">Merchant / pihak lain</FieldLabel>
              <Input id="d-merchant" className="h-10" {...form.register("merchant")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="d-note">Catatan</FieldLabel>
              <Textarea id="d-note" rows={2} {...form.register("note")} />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={update.isPending || !form.formState.isDirty}>
                {update.isPending ? "Menyimpan…" : "Simpan perubahan"}
              </Button>
              {tx.needs_review && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={review.isPending}
                  onClick={() => review.mutate(tx.id, { onSuccess: () => toast.success("Ditandai sudah dicek") })}
                >
                  <CheckIcon data-icon="inline-start" /> Tandai sudah dicek
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger render={<Button type="button" variant="destructive" className="ml-auto" />}>
                  <TrashIcon data-icon="inline-start" /> Hapus
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Hapus transaksi ini?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Saldo akun akan dihitung ulang. Transaksi dari notifikasi bisa dibuat lagi dengan &quot;parse ulang&quot;
                      di halaman Review.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={async () => {
                        await del.mutateAsync(tx.id)
                        toast.success("Transaksi dihapus")
                        router.push("/transaksi")
                      }}
                    >
                      Hapus
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {tx.raw_notification ? (
          <RawCard title="Notifikasi asli" raw={tx.raw_notification} />
        ) : (
          <Card>
            <CardContent className="text-sm text-muted-foreground">Dicatat manual, tidak ada notifikasi asli.</CardContent>
          </Card>
        )}
        {tx.counter_raw_notification && <RawCard title="Notifikasi sisi tujuan" raw={tx.counter_raw_notification} />}
      </div>
    </div>
  )
}

function RawCard({ title, raw }: { title: string; raw: RawNotification }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRingingIcon className="size-4" aria-hidden /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p className="text-xs text-muted-foreground">
          {raw.package_name} · {formatDateTime(raw.posted_at)}
        </p>
        <figure className="rounded-2xl bg-muted p-3">
          {raw.title && <figcaption className="font-medium">{raw.title}</figcaption>}
          <pre className="font-sans text-sm whitespace-pre-wrap">{raw.text}</pre>
        </figure>
      </CardContent>
    </Card>
  )
}
