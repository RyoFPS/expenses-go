"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { PencilSimpleIcon, PlusIcon, WalletIcon, WarningIcon } from "@phosphor-icons/react"
import Link from "next/link"
import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "@/lib/toast"
import { z } from "zod"

import { EmptyState, ErrorNote, ListSkeleton, PageHeader } from "@/components/common"
import { Money } from "@/components/money"
import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ACCOUNT_TYPE_LABEL, formatDateTime, formatRupiah } from "@/lib/format"
import { useAccountBalance, useAccounts, useReconcile, useSaveAccount } from "@/lib/queries"
import type { Account, AccountType } from "@/lib/types"

export default function AccountsPage() {
  const { data, isLoading, isError, error } = useAccounts()
  const [editing, setEditing] = React.useState<Account | "new" | null>(null)

  return (
    <>
      <PageHeader
        title="Akun"
        description="Saldo dihitung dari transaksi dan dicocokkan dengan saldo dari notifikasi bank."
        actions={
          <Button onClick={() => setEditing("new")}>
            <PlusIcon data-icon="inline-start" /> Tambah akun
          </Button>
        }
      />
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorNote error={error} />
      ) : !data?.length ? (
        <EmptyState
          icon={WalletIcon}
          title="Belum ada akun"
          description="Buat akun untuk setiap rekening bank, e-wallet, dan dompet tunai. Isi package Android agar notifikasinya tercatat otomatis."
          action={<Button onClick={() => setEditing("new")}>Tambah akun</Button>}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.map((a) => (
            <li key={a.id}>
              <AccountCard account={a} onEdit={() => setEditing(a)} />
            </li>
          ))}
        </ul>
      )}
      <AccountDialog account={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function AccountCard({ account, onEdit }: { account: Account; onEdit: () => void }) {
  const status = useAccountBalance(account.id)
  const reconcile = useReconcile()
  const diff = status.data?.diff ?? 0
  const snap = status.data?.last_snapshot

  return (
    <Card className={account.is_active ? undefined : "opacity-70"}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium">
              <span className="truncate">{account.name}</span>
              {!account.is_active && <Badge variant="outline">Nonaktif</Badge>}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {ACCOUNT_TYPE_LABEL[account.type]}
              {account.package_name && ` · ${account.package_name}`}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${account.name}`} onClick={onEdit}>
            <PencilSimpleIcon />
          </Button>
        </div>

        <Link href={`/transaksi?akun=${account.id}`} className="self-start">
          <Money value={account.balance} className="text-2xl font-semibold" />
        </Link>

        {snap && diff === 0 && (
          <p className="text-xs text-muted-foreground">
            Cocok dengan saldo notifikasi {formatDateTime(snap.observed_at)}
          </p>
        )}

        {snap && diff !== 0 && (
          <div role="status" className="flex flex-col gap-2 rounded-2xl bg-expense/8 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-expense">
              <WarningIcon weight="fill" className="size-4" aria-hidden /> Saldo tidak cocok
            </p>
            <p className="text-muted-foreground">
              Notifikasi {formatDateTime(snap.observed_at)} mencatat {formatRupiah(snap.balance)}, hitungan{" "}
              {formatRupiah(status.data?.calculated_at_snapshot ?? 0)} (selisih {formatRupiah(diff, { sign: true })}).
            </p>
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              disabled={reconcile.isPending}
              onClick={() =>
                reconcile.mutate(account.id, {
                  onSuccess: () => toast.success("Transaksi penyesuaian dibuat"),
                })
              }
            >
              Buat transaksi penyesuaian
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const schema = z.object({
  name: z.string().trim().min(1, "Isi nama akun").max(100),
  type: z.enum(["bank", "ewallet", "cash"]),
  packageName: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.]*$/, "Hanya huruf, angka, titik, dan garis bawah"),
  openingBalance: z.string().regex(/^-?[\d.]*$/, "Angka saja"),
  isActive: z.boolean(),
})
type FormValues = z.infer<typeof schema>

function AccountDialog({ account, onClose }: { account: Account | "new" | null; onClose: () => void }) {
  const save = useSaveAccount()
  const isNew = account === "new"
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", type: "cash", packageName: "", openingBalance: "0", isActive: true },
  })

  React.useEffect(() => {
    if (account && account !== "new") {
      form.reset({
        name: account.name,
        type: account.type,
        packageName: account.package_name ?? "",
        openingBalance: account.opening_balance.toLocaleString("id-ID"),
        isActive: account.is_active,
      })
    } else if (account === "new") {
      form.reset({ name: "", type: "cash", packageName: "", openingBalance: "0", isActive: true })
    }
  }, [account, form])

  const onSubmit = form.handleSubmit(async (v) => {
    const raw = v.openingBalance.replace(/\./g, "")
    await save.mutateAsync({
      id: isNew ? undefined : (account as Account).id,
      name: v.name,
      type: v.type,
      package_name: v.packageName || null,
      opening_balance: raw === "" || raw === "-" ? 0 : Number(raw),
      is_active: v.isActive,
    })
    toast.success(isNew ? "Akun dibuat" : "Akun diperbarui")
    onClose()
  })

  return (
    <Dialog open={account !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Tambah akun" : "Ubah akun"}</DialogTitle>
          <DialogDescription>Saldo awal adalah saldo sebelum transaksi pertama yang tercatat.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field data-invalid={!!form.formState.errors.name || undefined}>
            <FieldLabel htmlFor="a-name">Nama</FieldLabel>
            <Input id="a-name" className="h-10" placeholder="mis. BCA, GoPay, Tunai" {...form.register("name")} />
            <FieldError errors={[form.formState.errors.name]} />
          </Field>
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="a-type">Jenis</FieldLabel>
                <OptionSelect
                  id="a-type"
                  value={field.value}
                  onChange={(v) => field.onChange(v as AccountType)}
                  options={(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => ({ value: t, label: ACCOUNT_TYPE_LABEL[t] }))}
                />
              </Field>
            )}
          />
          <Field data-invalid={!!form.formState.errors.packageName || undefined}>
            <FieldLabel htmlFor="a-pkg">Package Android (opsional)</FieldLabel>
            <Input id="a-pkg" className="h-10 font-mono text-sm" placeholder="com.bca.mybca.omni.android" {...form.register("packageName")} />
            <FieldDescription>Notifikasi dari app ini dicatat ke akun ini.</FieldDescription>
            <FieldError errors={[form.formState.errors.packageName]} />
          </Field>
          <Field data-invalid={!!form.formState.errors.openingBalance || undefined}>
            <FieldLabel htmlFor="a-open">Saldo awal (Rp)</FieldLabel>
            <Input id="a-open" inputMode="numeric" className="money h-10" {...form.register("openingBalance")} />
            <FieldError errors={[form.formState.errors.openingBalance]} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" {...form.register("isActive")} />
            Akun aktif
          </label>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Menyimpan…" : "Simpan"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
