"use client"

import { ArrowClockwiseIcon, CheckCircleIcon, CheckIcon, SealCheckIcon } from "@phosphor-icons/react"
import { toast } from "@/lib/toast"

import { EmptyState, ErrorNote, ListSkeleton, PageHeader, useLookups } from "@/components/common"
import { OptionSelect } from "@/components/option-select"
import { TransactionRow } from "@/components/transaction-row"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDateTime } from "@/lib/format"
import {
  useMarkReviewed,
  useRawNotifications,
  useReparse,
  useReparseAll,
  useTransactions,
  useUpdateTransaction,
} from "@/lib/queries"

export default function ReviewPage() {
  const review = useTransactions({ needs_review: true, page_size: 100 })
  const failed = useRawNotifications("failed")

  return (
    <>
      <PageHeader title="Review" description="Transaksi yang perlu dicek dan notifikasi yang gagal dibaca parser." />
      <Tabs defaultValue="review">
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
        </TabsContent>
        <TabsContent value="failed" className="mt-4">
          <FailedRaw query={failed} />
        </TabsContent>
      </Tabs>
    </>
  )
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

function FailedRaw({ query }: { query: ReturnType<typeof useRawNotifications> }) {
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
      <Button
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
      </Button>
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
