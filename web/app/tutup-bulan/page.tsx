"use client"

import {
  CaretLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react"
import Link from "next/link"
import * as React from "react"

import { ErrorNote, ListSkeleton, PageHeader } from "@/components/common"
import { Money } from "@/components/money"
import { MonthPicker } from "@/components/month-picker"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  addMonths,
  formatDateTime,
  formatMonth,
  jakartaMonth,
  monthEnd,
} from "@/lib/format"
import { monthCloseStatus } from "@/lib/month-close"
import { useBudgets, useMonthClose, useSummary } from "@/lib/queries"

export default function MonthClosePage() {
  const current = jakartaMonth()
  const [month, setMonth] = React.useState(current)
  const summary = useSummary(month)
  const budgets = useBudgets(month)
  const close = useMonthClose(month)
  const from = `${month}-01`
  const to = monthEnd(month)
  const txLink = `/transaksi?dari=${from}&sampai=${to}&tanpa_kategori=1`
  const reviewLink = (tab: string) => `/review?bulan=${month}&tab=${tab}`
  const status = close.data && monthCloseStatus(close.data)
  const budgetTotal =
    budgets.data?.reduce((sum, budget) => sum + budget.amount, 0) ?? 0
  const budgetSpent =
    budgets.data?.reduce(
      (sum, budget) =>
        sum +
        (summary.data?.by_category.find(
          (item) => item.category_id === budget.category_id
        )?.total ?? 0),
      0
    ) ?? 0

  return (
    <>
      <PageHeader
        title="Tutup bulan"
        description="Periksa pencatatan sebelum meninjau laporan. Checklist mengikuti data terkini."
        actions={
          <div className="flex w-full items-center gap-1 sm:w-auto">
            <Button
              variant="outline"
              size="icon"
              aria-label="Bulan sebelumnya"
              onClick={() => setMonth((value) => addMonths(value, -1))}
            >
              <CaretLeftIcon />
            </Button>
            <MonthPicker value={month} max={current} onChange={setMonth} />
            <Button
              variant="outline"
              size="icon"
              aria-label="Bulan berikutnya"
              disabled={month >= current}
              onClick={() => setMonth((value) => addMonths(value, 1))}
            >
              <CaretRightIcon />
            </Button>
          </div>
        }
      />

      <h2 className="mb-3 text-lg font-semibold">
        Ringkasan {formatMonth(month)}
      </h2>
      {summary.isLoading || budgets.isLoading ? (
        <ListSkeleton rows={2} />
      ) : summary.isError ? (
        <ErrorNote error={summary.error} />
      ) : budgets.isError ? (
        <ErrorNote error={budgets.error} />
      ) : (
        summary.data && (
          <div className="mb-8 grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">Pemasukan</p>
                <Money
                  value={summary.data.income}
                  type="income"
                  className="text-xl font-semibold"
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">Pengeluaran</p>
                <Money
                  value={summary.data.expense}
                  type="expense"
                  className="text-xl font-semibold"
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Anggaran pengeluaran
                </p>
                <Money value={budgetSpent} />{" "}
                <span className="text-sm text-muted-foreground">
                  dari <Money value={budgetTotal} />
                </span>
              </CardContent>
            </Card>
          </div>
        )
      )}

      <h2 className="mb-3 text-lg font-semibold">
        Checklist {formatMonth(month)}
      </h2>
      {close.isLoading ? (
        <ListSkeleton rows={4} />
      ) : close.isError ? (
        <ErrorNote error={close.error} />
      ) : (
        close.data && (
          <>
            {status === "ready" && (
              <div
                role="status"
                className="mb-4 flex items-center gap-2 rounded-2xl bg-income/10 p-4 text-sm font-medium"
              >
                <CheckCircleIcon className="size-5" /> Bulan ini siap ditinjau.
                Tidak ada pekerjaan tertunda.
              </div>
            )}
            {status === "unverified" && (
              <p
                role="status"
                className="mb-4 rounded-2xl bg-muted p-4 text-sm"
              >
                Tidak ada pekerjaan pencatatan tertunda, tetapi rekonsiliasi
                akun tanpa snapshot belum dapat diverifikasi.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <ChecklistCard
                title="Transaksi perlu ditinjau"
                count={close.data.needs_review}
                href={reviewLink("review")}
              />
              <ChecklistCard
                title="Notifikasi gagal dibaca"
                count={close.data.failed_notifications}
                href={reviewLink("failed")}
              />
              <ChecklistCard
                title="Pemasukan/pengeluaran tanpa kategori"
                count={close.data.uncategorized}
                href={txLink}
              />
            </div>
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Rekonsiliasi saldo akun terbaru</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Selisih snapshot terakhir terhadap pencatatan saat snapshot.
                  Ini status akun terbaru, bukan selisih historis{" "}
                  {formatMonth(month)}.
                </p>
                {close.data.reconciliation.length === 0 && (
                  <p>Belum ada akun.</p>
                )}
                {close.data.reconciliation.map((account) => (
                  <div
                    key={account.account_id}
                    className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"
                  >
                    <div>
                      <p className="font-medium">{account.name}</p>
                      <p className="text-muted-foreground">
                        {account.observed_at
                          ? `Snapshot ${formatDateTime(account.observed_at)}`
                          : "Belum ada snapshot saldo"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p>
                        {account.diff === null ? (
                          "Belum dapat dicocokkan"
                        ) : account.diff === 0 ? (
                          "Sesuai"
                        ) : (
                          <>
                            Selisih <Money value={account.diff} />
                          </>
                        )}
                      </p>
                      <Link
                        href="/akun"
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        Buka akun
                      </Link>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )
      )}
    </>
  )
}

function ChecklistCard({
  title,
  count,
  href,
}: {
  title: string
  count: number
  href: string
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <p className="font-medium">{title}</p>
        <p
          className={
            count
              ? "text-xl font-semibold text-expense"
              : "text-sm text-muted-foreground"
          }
        >
          {count ? `${count} perlu ditinjau` : "Selesai"}
        </p>
        <Link
          href={href}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Buka daftar
        </Link>
      </CardContent>
    </Card>
  )
}
