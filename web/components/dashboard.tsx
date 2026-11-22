"use client"

import {
  ArrowRightIcon,
  ReceiptIcon,
  WalletIcon,
  WarningIcon,
} from "@phosphor-icons/react"
import Link from "next/link"

import { CategoryBars } from "@/components/charts/category-bars"
import { CumulativeExpense } from "@/components/charts/cumulative-expense"
import { MiniCashflow } from "@/components/charts/mini-cashflow"
import { EmptyState, ErrorNote, ListSkeleton } from "@/components/common"
import { Money } from "@/components/money"
import { useQuickAdd } from "@/components/quick-add"
import { TransactionRow } from "@/components/transaction-row"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { previousComparableEnd } from "@/lib/expense-charts"
import {
  ACCOUNT_TYPE_LABEL,
  addDays,
  addMonths,
  formatMonth,
  jakartaDate,
  jakartaMonth,
} from "@/lib/format"
import {
  useAccounts,
  useCashflow,
  useNeedsReviewCount,
  useNetWorth,
  useSummary,
  useTransactions,
} from "@/lib/queries"
import type { Account, NetWorth, Page, Transaction } from "@/lib/types"

export interface DashboardInitial {
  netWorth: NetWorth | null
  accounts: Account[] | null
  reviewPage: Page<Transaction> | null
}

export function Dashboard({ initial }: { initial?: DashboardInitial }) {
  const month = jakartaMonth()
  const today = jakartaDate()
  const previousMonth = addMonths(month, -1)
  const previousEnd = previousComparableEnd(today)
  const netWorth = useNetWorth({ initialData: initial?.netWorth ?? undefined })
  const accounts = useAccounts({ initialData: initial?.accounts ?? undefined })
  const summary = useSummary(month)
  const cashflow = useCashflow(addDays(today, -29), today, "day")
  const cumulative = useCashflow(`${month}-01`, today, "day")
  const previousCumulative = useCashflow(
    `${previousMonth}-01`,
    previousEnd,
    "day"
  )
  const recent = useTransactions({ page_size: 8 })
  const reviewCount = useNeedsReviewCount({
    initialData: initial?.reviewPage ?? undefined,
  })
  const { open } = useQuickAdd()

  const activeAccounts = (accounts.data ?? []).filter((a) => a.is_active)

  return (
    <div className="flex flex-col gap-6">
      {/* Total saldo */}
      <section aria-labelledby="total-heading" className="flex flex-col gap-1">
        <h1 id="total-heading" className="text-sm text-muted-foreground">
          Total saldo
        </h1>
        {netWorth.isLoading ? (
          <Skeleton className="h-11 w-56" />
        ) : (
          <Money
            value={netWorth.data?.total ?? 0}
            className="text-4xl font-semibold tracking-tight md:text-5xl"
          />
        )}
      </section>

      {!!reviewCount.data && (
        <Link
          prefetch={false}
          href="/review"
          className="flex items-center gap-3 rounded-2xl border border-expense/30 bg-expense/8 px-4 py-3 text-sm"
        >
          <WarningIcon
            weight="fill"
            className="size-5 shrink-0 text-expense"
            aria-hidden
          />
          <span className="flex-1">
            <strong className="money">{reviewCount.data}</strong> transaksi
            perlu dicek
          </span>
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      )}

      {/* Saldo per akun */}
      <section aria-labelledby="accounts-heading">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="accounts-heading" className="font-medium">
            Akun
          </h2>
          <Link
            prefetch={false}
            href="/akun"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Kelola
          </Link>
        </div>
        {accounts.isLoading ? (
          <div className="flex gap-3">
            <Skeleton className="h-24 w-40 rounded-3xl" />
            <Skeleton className="h-24 w-40 rounded-3xl" />
          </div>
        ) : accounts.isError ? (
          <ErrorNote error={accounts.error} />
        ) : activeAccounts.length === 0 ? (
          <EmptyState
            icon={WalletIcon}
            title="Belum ada akun"
            description="Tambahkan akun bank, e-wallet, dan tunai untuk mulai mencatat."
            action={
              <Button render={<Link prefetch={false} href="/akun" />}>
                Tambah akun
              </Button>
            }
          />
        ) : (
          <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:px-0">
            {activeAccounts.map((a) => (
              <li key={a.id} className="w-40 shrink-0 snap-start md:w-auto">
                <Link
                  prefetch={false}
                  href={`/transaksi?akun=${a.id}`}
                  className="flex h-full flex-col gap-3 rounded-3xl bg-card p-4 ring-1 ring-foreground/5 transition-colors hover:bg-muted"
                >
                  <span className="flex flex-col">
                    <span className="truncate text-sm font-medium">
                      {a.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {ACCOUNT_TYPE_LABEL[a.type]}
                    </span>
                  </span>
                  <Money value={a.balance} className="text-lg font-semibold" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Ringkasan bulan ini */}
      <section
        aria-labelledby="month-heading"
        className="grid gap-4 md:grid-cols-[1fr_1.4fr]"
      >
        <Card>
          <CardHeader>
            <CardTitle id="month-heading">{formatMonth(month)}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {summary.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : summary.data ? (
              <dl className="grid grid-cols-1 gap-3 text-sm">
                <div className="flex items-baseline justify-between">
                  <dt className="text-muted-foreground">Masuk</dt>
                  <dd>
                    <Money
                      value={summary.data.income}
                      type="income"
                      className="text-lg font-semibold"
                    />
                  </dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="text-muted-foreground">Keluar</dt>
                  <dd>
                    <Money
                      value={summary.data.expense}
                      type="expense"
                      className="text-lg font-semibold"
                    />
                  </dd>
                </div>
                <div className="flex items-baseline justify-between border-t pt-3">
                  <dt className="font-medium">Selisih</dt>
                  <dd>
                    <Money
                      value={summary.data.net}
                      type={summary.data.net >= 0 ? "income" : "expense"}
                      className="text-lg font-semibold"
                    />
                  </dd>
                </div>
              </dl>
            ) : (
              summary.isError && <ErrorNote error={summary.error} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Arus kas 30 hari</CardTitle>
          </CardHeader>
          <CardContent>
            {cashflow.data ? (
              <MiniCashflow data={cashflow.data} />
            ) : (
              <Skeleton className="aspect-video w-full rounded-2xl" />
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Pengeluaran bulan ini vs bulan lalu</CardTitle>
        </CardHeader>
        <CardContent>
          {cumulative.isError ? (
            <ErrorNote error={cumulative.error} />
          ) : previousCumulative.isError ? (
            <ErrorNote error={previousCumulative.error} />
          ) : cumulative.data && previousCumulative.data ? (
            <CumulativeExpense
              current={cumulative.data}
              previous={previousCumulative.data}
              previousMonth={previousMonth}
            />
          ) : (
            <Skeleton className="aspect-[3/1] w-full max-w-2xl rounded-2xl" />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Pengeluaran per kategori */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Pengeluaran per kategori</CardTitle>
            <Link
              prefetch={false}
              href="/laporan"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Laporan
            </Link>
          </CardHeader>
          <CardContent>
            {summary.isLoading ? (
              <ListSkeleton rows={3} />
            ) : summary.data &&
              summary.data.by_category.some((c) => c.type === "expense") ? (
              <CategoryBars
                items={summary.data.by_category}
                type="expense"
                limit={5}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Belum ada pengeluaran bulan ini.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Transaksi terbaru */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Transaksi terbaru</CardTitle>
            <Link
              prefetch={false}
              href="/transaksi"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Semua
            </Link>
          </CardHeader>
          <CardContent>
            {recent.isLoading ? (
              <ListSkeleton rows={4} />
            ) : recent.data && recent.data.items.length > 0 ? (
              <div className="divide-y">
                {recent.data.items.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={ReceiptIcon}
                title="Belum ada transaksi"
                description="Transaksi dari notifikasi bank akan muncul otomatis. Catat pengeluaran tunai lewat tombol +."
                action={<Button onClick={open}>Catat tunai</Button>}
                className="border-0 py-6"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
