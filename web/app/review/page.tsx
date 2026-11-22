"use client"

import { ArrowClockwiseIcon, CheckCircleIcon, CheckIcon, SealCheckIcon } from "@phosphor-icons/react"
import { useSearchParams } from "next/navigation"
import * as React from "react"
import { toast } from "@/lib/toast"

import { EmptyState, ErrorNote, ListSkeleton, PageHeader, useLookups } from "@/components/common"
import { OptionSelect } from "@/components/option-select"
import { TransactionRow } from "@/components/transaction-row"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDateTime, formatMonth, monthEnd } from "@/lib/format"
import {
  useMarkReviewed,
  useRawNotifications,
  useReparse,
  useReparseAll,
  useTransactions,
  useUpdateTransaction,
} from "@/lib/queries"

export default function ReviewPage() {
  return <React.Suspense fallback={<ListSkeleton />}><Review /></React.Suspense>
}

function Review() {
  const params = useSearchParams()
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get("bulan") ?? "") ? params.get("bulan")! : null
  const dateFrom = month ? `${month}-01` : undefined
  const dateTo = month ? monthEnd(month) : undefined
  const [reviewPage, setReviewPage] = React.useState(1)
  const [failedPage, setFailedPage] = React.useState(1)
  const review = useTransactions({ needs_review: true, date_from: dateFrom, date_to: dateTo, page: reviewPage, page_size: 100 })
  const failed = useRawNotifications("failed", dateFrom, dateTo, failedPage)

  return (
    <>
      <PageHeader title="Review" description={month ? `Pekerjaan ${formatMonth(month)}` : "Transaksi yang perlu dicek dan notifikasi yang gagal dibaca parser."} />
      <Tabs defaultValue={params.get("tab") === "failed" ? "failed" : "review"}>
        <TabsList>
          <TabsTrigger value="review">
            Perlu dicek {!!review.data?.total && <Badge variant="secondary">{review.data.total}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="failed">
            Gagal dibaca {!!failed.data?.total && <Badge variant="secondary">{failed.data.total}</Badge>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="review" className="mt-4">
          <NeedsReview query={review} />
          <Pager total={review.data?.total ?? 0} page={reviewPage} onChange={setReviewPage} />
        </TabsContent>
        <TabsContent value="failed" className="mt-4">
          <FailedRaw query={failed} filtered={Boolean(month)} />
          <Pager total={failed.data?.total ?? 0} page={failedPage} onChange={setFailedPage} />
        </TabsContent>
      </Tabs>
    </>
  )
}

function Pager({ total, page, onChange }: { total: number; page: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / 100))
  if (pages === 1 && page === 1) return null
  return <nav aria-label="Halaman review" className="mt-4 flex items-center justify-between gap-2 text-sm">
    <Button variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>Sebelumnya</Button>
    <span>{page > pages ? "Daftar berubah" : `${page} / ${pages}`}</span>
    <Button variant="outline" disabled={page >= pages} onClick={() => onChange(page + 1)}>Berikutnya</Button>
  </nav>
}

function NeedsReview({ query }: { query: ReturnType<typeof useTransactions> }) {
  const lookups = useLookups()
  const update = useUpdateTransaction()
  const mark = useMarkReviewed()

  if (query.isLoading) return <ListSkeleton />
  if (query.isError) return <ErrorNote error={query.error} />
  if (!query.data?.items.length)
    return <EmptyState icon={SealCheckIcon} title="Semua beres" description="Tidak ada transaksi yang perlu dicek." />

  return (
    <ul className="flex flex-col gap-3">
      {query.data.items.map((tx) => (
        <li key={tx.id}>
          <Card>
            <CardContent className="flex flex-col gap-3">
              <TransactionRow tx={tx} />
              <div className="flex flex-wrap items-center gap-2">
                  <OptionSelect
                    aria-label="Kategori"
                    value={tx.category_id ?? ""}
                    emptyLabel="Tanpa kategori"
                    options={lookups.categories.filter((c) => c.type === tx.type).map((c) => ({ value: c.id, label: c.name }))}
                    onChange={(v) => update.mutate({ id: tx.id, category_id: v || null })}
                    className="w-48"
                  />
                <Button
                  variant="secondary"
                  disabled={mark.isPending}
                  onClick={() => mark.mutate(tx.id, { onSuccess: () => toast.success("Ditandai sudah dicek") })}
                >
                  <CheckIcon data-icon="inline-start" /> Sudah benar
                </Button>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
}

function FailedRaw({ query, filtered }: { query: ReturnType<typeof useRawNotifications>; filtered: boolean }) {
  const reparse = useReparse()
  const reparseAll = useReparseAll()

  if (query.isLoading) return <ListSkeleton />
  if (query.isError) return <ErrorNote error={query.error} />
  if (!query.data?.items.length)
    return (
      <EmptyState
        icon={CheckCircleIcon}
        title="Tidak ada notifikasi gagal"
        description="Notifikasi yang formatnya belum dikenali atau belum punya akun akan muncul di sini."
      />
    )

  return (
    <div className="flex flex-col gap-3">
      {!filtered && <Button
        variant="outline"
        className="self-start"
        disabled={reparseAll.isPending}
        onClick={() =>
          reparseAll.mutate("failed", {
            onSuccess: (r) => toast.success(`${r.by_status.parsed ?? 0} dari ${r.processed} berhasil diproses`),
          })
        }
      >
        <ArrowClockwiseIcon data-icon="inline-start" /> Parse ulang semua
      </Button>}
      <ul className="flex flex-col gap-3">
        {query.data.items.map((raw) => (
          <li key={raw.id}>
            <Card>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p className="text-xs text-muted-foreground">
                  {raw.package_name} · {formatDateTime(raw.posted_at)}
                </p>
                <div className="rounded-2xl bg-muted p-3">
                  {raw.title && <p className="font-medium">{raw.title}</p>}
                  <p className="whitespace-pre-wrap">{raw.text}</p>
                </div>
                {raw.parse_error && <p className="text-expense">{raw.parse_error}</p>}
                <Button
                  size="sm"
                  variant="outline"
                  className="self-start"
                  disabled={reparse.isPending}
                  onClick={() =>
                    reparse.mutate(raw.id, {
                      onSuccess: (r) =>
                        r.parse_status === "parsed"
                          ? toast.success("Berhasil diproses")
                          : toast.warning(`Masih ${r.parse_status === "failed" ? "gagal" : r.parse_status}`),
                    })
                  }
                >
                  <ArrowClockwiseIcon data-icon="inline-start" /> Parse ulang
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
