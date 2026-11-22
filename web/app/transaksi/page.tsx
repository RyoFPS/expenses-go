"use client"

import { CaretLeftIcon, CaretRightIcon, FunnelSimpleIcon, MagnifyingGlassIcon, ReceiptIcon, TrashIcon } from "@phosphor-icons/react"
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import * as React from "react"
import { toast } from "@/lib/toast"

import { EmptyState, ErrorNote, ListSkeleton, PageHeader, useLookups } from "@/components/common"
import { DatePicker } from "@/components/date-picker"
import { Money } from "@/components/money"
import { OptionSelect } from "@/components/option-select"
import { TransactionRow, txTitle } from "@/components/transaction-row"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TX_TYPE_LABEL, formatDateTime } from "@/lib/format"
import { useDeleteTransaction, useTransactions, useUpdateTransaction } from "@/lib/queries"
import type { Transaction, TransactionFilters, TxType } from "@/lib/types"

const PAGE_SIZE = 50

export default function TransactionsPage() {
  return (
    <React.Suspense fallback={<ListSkeleton />}>
      <Transactions />
    </React.Suspense>
  )
}

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value)
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** State filter yang memanggil onChange (mis. kembali ke halaman 1) setiap kali diubah. */
function useFilterState<T>(initial: T, onChange: () => void) {
  const [value, setValue] = React.useState<T>(initial)
  const set = (v: T) => {
    setValue(v)
    onChange()
  }
  return [value, set] as const
}

function Transactions() {
  const params = useSearchParams()
  const [page, setPage] = React.useState(1)
  const resetPage = () => setPage(1)
  const [accountId, setAccountId] = useFilterState(params.get("akun") ?? "", resetPage)
  const [categoryId, setCategoryId] = useFilterState(params.get("kategori") ?? "", resetPage)
  const [type, setType] = useFilterState<TxType | "">((params.get("tipe") as TxType) ?? "", resetPage)
  const [dateFrom, setDateFrom] = useFilterState(params.get("dari") ?? "", resetPage)
  const [dateTo, setDateTo] = useFilterState(params.get("sampai") ?? "", resetPage)
  const [search, setSearch] = useFilterState("", resetPage)
  const [showFilters, setShowFilters] = React.useState(Boolean(params.get("akun") || params.get("kategori")))
  const q = useDebounced(search.trim())

  const filters: TransactionFilters = {
    account_id: accountId || undefined,
    category_id: categoryId || undefined,
    type: type || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    q: q || undefined,
    page,
    page_size: PAGE_SIZE,
  }

  const { data, isLoading, isError, error, isFetching } = useTransactions(filters)
  const lookups = useLookups()
  const [toDelete, setToDelete] = React.useState<Transaction | null>(null)
  const del = useDeleteTransaction()

  const activeFilterCount = [accountId, categoryId, type, dateFrom, dateTo].filter(Boolean).length
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  const resetFilters = () => {
    setAccountId("")
    setCategoryId("")
    setType("")
    setDateFrom("")
    setDateTo("")
    setSearch("")
  }

  return (
    <>
      <PageHeader
        title="Transaksi"
        description={data ? `${data.total.toLocaleString("id-ID")} transaksi` : undefined}
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              aria-label="Cari merchant atau catatan"
              placeholder="Cari merchant / catatan"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 pl-9"
            />
          </div>
          <Button
            variant="outline"
            className="h-10"
            aria-expanded={showFilters}
            aria-controls="tx-filters"
            onClick={() => setShowFilters((s) => !s)}
          >
            <FunnelSimpleIcon data-icon="inline-start" />
            Filter{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </Button>
        </div>

        {showFilters && (
          <div id="tx-filters" className="grid grid-cols-2 gap-3 rounded-3xl bg-muted/50 p-4 md:grid-cols-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-from">Dari</Label>
              <DatePicker id="f-from" value={dateFrom} onChange={setDateFrom} clearable />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-to">Sampai</Label>
              <DatePicker id="f-to" value={dateTo} onChange={setDateTo} clearable />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-account">Akun</Label>
              <OptionSelect
                id="f-account"
                value={accountId}
                onChange={setAccountId}
                emptyLabel="Semua akun"
                options={lookups.accounts.map((a) => ({ value: a.id, label: a.name }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-category">Kategori</Label>
              <OptionSelect
                id="f-category"
                value={categoryId}
                onChange={setCategoryId}
                emptyLabel="Semua kategori"
                options={lookups.categories.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-type">Tipe</Label>
              <OptionSelect
                id="f-type"
                value={type}
                onChange={(v) => setType(v as TxType | "")}
                emptyLabel="Semua tipe"
                options={(Object.keys(TX_TYPE_LABEL) as TxType[]).map((t) => ({ value: t, label: TX_TYPE_LABEL[t] }))}
              />
            </div>
            {activeFilterCount > 0 && (
              <Button variant="ghost" className="col-span-2 justify-self-start md:col-span-5" onClick={resetFilters}>
                Hapus filter
              </Button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <ListSkeleton rows={8} />
      ) : isError ? (
        <ErrorNote error={error} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={ReceiptIcon}
          title={activeFilterCount || q ? "Tidak ada transaksi yang cocok" : "Belum ada transaksi"}
          description={activeFilterCount || q ? "Coba ubah atau hapus filter." : undefined}
        />
      ) : (
        <div aria-busy={isFetching}>
          {/* Mobile: daftar */}
          <div className="divide-y md:hidden">
            {data.items.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </div>
          {/* Desktop: tabel */}
          <div className="hidden md:block">
            <TransactionTable items={data.items} onDelete={setToDelete} />
          </div>

          {totalPages > 1 && (
            <nav aria-label="Halaman" className="mt-4 flex items-center justify-between">
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <CaretLeftIcon data-icon="inline-start" /> Sebelumnya
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Berikutnya <CaretRightIcon data-icon="inline-end" />
              </Button>
            </nav>
          )}
        </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus transaksi?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && `${txTitle(toDelete, lookups.accountName)} · ${formatDateTime(toDelete.occurred_at)}`}. Saldo akun
              akan dihitung ulang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!toDelete) return
                await del.mutateAsync(toDelete.id)
                toast.success("Transaksi dihapus")
                setToDelete(null)
              }}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// TanStack Table v9: fitur & helper di scope modul agar stabil antar render.
const features = tableFeatures({})
const col = createColumnHelper<typeof features, Transaction>()

function TransactionTable({ items, onDelete }: { items: Transaction[]; onDelete: (tx: Transaction) => void }) {
  const lookups = useLookups()
  const update = useUpdateTransaction()

  const columns = React.useMemo(
    () =>
      col.columns([
      col.accessor("occurred_at", {
        header: "Waktu",
        cell: (c) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(c.getValue())}</span>,
      }),
      col.display({
        id: "desc",
        header: "Keterangan",
        cell: ({ row }) => (
          <Link href={`/transaksi/${row.original.id}`} className="font-medium hover:underline">
            {txTitle(row.original, lookups.accountName)}
            {row.original.needs_review && <span className="ml-2 text-xs font-normal text-expense">perlu review</span>}
          </Link>
        ),
      }),
      col.accessor("account_id", {
        header: "Akun",
        cell: (c) => <span className="whitespace-nowrap">{lookups.accountName(c.getValue())}</span>,
      }),
      col.accessor("category_id", {
        header: "Kategori",
        cell: ({ row }) => {
          const tx = row.original
          return (
            <OptionSelect
              aria-label={`Kategori untuk ${txTitle(tx, lookups.accountName)}`}
              value={tx.category_id ?? ""}
              emptyLabel="Tanpa kategori"
              options={lookups.categories.filter((c) => c.type === tx.type).map((c) => ({ value: c.id, label: c.name }))}
              onChange={(v) =>
                update.mutate({ id: tx.id, category_id: v || null }, { onSuccess: () => toast.success("Kategori diperbarui") })
              }
              className="h-8 w-40"
            />
          )
        },
      }),
      col.accessor("amount", {
        header: () => <span className="block text-right">Nominal</span>,
        cell: ({ row }) => (
          <span className="block text-right">
            <Money value={row.original.amount} type={row.original.type} signed className="font-semibold" />
          </span>
        ),
      }),
      col.display({
        id: "actions",
        header: () => <span className="sr-only">Aksi</span>,
        cell: ({ row }) => (
          <Button variant="ghost" size="icon-sm" aria-label="Hapus transaksi" onClick={() => onDelete(row.original)}>
            <TrashIcon />
          </Button>
        ),
      }),
      ]),
    [lookups, update, onDelete]
  )

  const table = useTable({ features, columns, data: items, getRowId: (r: Transaction) => r.id })

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hg.headers.map((h) => (
              <TableHead key={h.id}>{h.isPlaceholder ? null : <table.FlexRender header={h} />}</TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id}>
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
