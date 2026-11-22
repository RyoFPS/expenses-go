"use client"

import {
  ArrowRightIcon,
  ReceiptIcon,
  WalletIcon,
  WarningIcon,
} from "@phosphor-icons/react"
import Link from "next/link"

import {
  LazyCategoryBars,
  LazyCumulativeExpense,
  LazyMiniCashflow,
} from "@/components/charts/lazy"
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
  formatDate,
  formatDateTime,
  formatMonth,
  jakartaDate,
  jakartaMonth,
} from "@/lib/format"
import {
  useAccounts,
  useCashflow,
  useLatestNotification,
  useListenerStatus,
  useNeedsReviewCount,
  useNetWorth,
  useProjection,
  useSavingGoals,
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
  const projection = useProjection()
  const accounts = useAccounts({ initialData: initial?.accounts ?? undefined })
  const savingGoals = useSavingGoals()
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
  const latestNotification = useLatestNotification()
  const listenerStatuses = useListenerStatus()
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

      <Card>
        <CardHeader>
          <CardTitle id="projection-heading">Proyeksi arus kas</CardTitle>
        </CardHeader>
        <CardContent aria-labelledby="projection-heading" className="space-y-4">
          {projection.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : projection.isError ? (
            <ErrorNote error={projection.error} />
          ) : projection.data?.estimated_7d == null || projection.data.estimated_30d == null ? (
            <p className="text-sm text-muted-foreground">
              Belum cukup riwayat transaksi pada tiga bulan kalender lengkap terakhir untuk membuat proyeksi.
            </p>
          ) : (
            <>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted-foreground">Estimasi saldo 7 hari</dt>
                  <dd><Money value={projection.data.estimated_7d} className="text-2xl font-semibold" /></dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Estimasi saldo 30 hari</dt>
                  <dd><Money value={projection.data.estimated_30d} className="text-2xl font-semibold" /></dd>
                </div>
              </dl>
              {projection.data.upcoming_bills.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium">Tagihan rutin dalam 30 hari</p>
                  <ul className="space-y-1 text-sm">
                    {projection.data.upcoming_bills.map((bill) => (
                      <li key={`${bill.account_name}:${bill.merchant}:${bill.due_date}`} className="flex flex-wrap justify-between gap-x-3">
                        <span>{bill.merchant} · {bill.account_name} · {formatDate(`${bill.due_date}T00:00:00+07:00`)}</span>
                        <Money value={bill.estimated_amount} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          <p className="text-xs text-muted-foreground">
            Perkiraan dari rata-rata harian tiga bulan lengkap dan tagihan terkonfirmasi; bukan saldo pasti.
          </p>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground" aria-live="polite">
        <p>
          <span className="font-medium text-foreground">Notifikasi terakhir diterima:</span>{" "}
          {latestNotification.isLoading
            ? "Memuat…"
            : latestNotification.data?.received_at
              ? `${formatDateTime(latestNotification.data.received_at)} WIB`
              : latestNotification.isError
                ? null
                : "Belum ada notifikasi yang diterima."}
        </p>
        {latestNotification.isError && <ErrorNote error={latestNotification.error} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kesehatan listener Android</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {listenerStatuses.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : listenerStatuses.isError ? (
            <ErrorNote error={listenerStatuses.error} />
          ) : listenerStatuses.data?.length ? (
            listenerStatuses.data.map((device) => (
              <div key={device.device_id} className="space-y-1">
                <p className="font-medium">Android · {device.app_version}</p>
                <p className={device.stale ? "text-expense" : "text-muted-foreground"}>
                  Heartbeat terakhir: {formatDateTime(device.last_seen)} WIB
                  {device.stale && " · Kedaluwarsa (>45 menit), bukan bukti transaksi terlewat."}
                </p>
                <p className={device.listener_enabled ? "text-muted-foreground" : "text-expense"}>
                  Izin listener: {device.listener_enabled ? "Aktif" : "Mati"}
                </p>
                <p className={device.failed_count ? "text-expense" : "text-muted-foreground"}>
                  Antrean: {device.pending_count} menunggu · {device.failed_count} gagal
                </p>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">Belum ada heartbeat dari aplikasi Android.</p>
          )}
        </CardContent>
      </Card>

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

      {(savingGoals.isLoading || savingGoals.isError || (savingGoals.data?.length ?? 0) > 0) && (
        <section aria-labelledby="saving-goals-heading" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 id="saving-goals-heading" className="font-medium">Target tabungan</h2>
            <Link prefetch={false} href="/akun" className="text-sm text-muted-foreground hover:text-foreground">Kelola</Link>
          </div>
          {savingGoals.isLoading ? (
            <Skeleton className="h-24 w-full rounded-3xl" />
          ) : savingGoals.isError ? (
            <ErrorNote error={savingGoals.error} />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {savingGoals.data?.map((goal) => (
              <li key={goal.id} className="rounded-3xl bg-card p-4 ring-1 ring-foreground/5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{goal.name}</h3>
                    <p className="text-xs text-muted-foreground">{goal.account_name}{goal.target_date ? ` · Target ${goalDate(goal.target_date)}` : ""}</p>
                  </div>
                  <span className="shrink-0 text-sm font-medium">{Math.round(goal.progress_percent)}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`Progres target ${goal.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={goal.progress_percent}
                  className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
                >
                  <div className="h-full rounded-full bg-primary" style={{ width: `${goal.progress_percent}%` }} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:text-sm">
                  <div><p className="text-muted-foreground">Saldo</p><Money value={goal.balance} className="font-medium" /></div>
                  <div><p className="text-muted-foreground">Target</p><Money value={goal.target_amount} className="font-medium" /></div>
                  <div><p className="text-muted-foreground">Sisa</p><Money value={goal.remaining} type={goal.remaining < 0 ? "income" : "neutral"} className="font-medium" /></div>
                </div>
              </li>
              ))}
            </ul>
          )}
        </section>
      )}

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
              <LazyMiniCashflow data={cashflow.data} />
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
            <LazyCumulativeExpense
              current={cumulative.data}
              previous={previousCumulative.data}
              previousMonth={previousMonth}
            />
          ) : (
            <Skeleton className="h-44 w-full rounded-2xl md:h-52" />
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
              <LazyCategoryBars
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

function goalDate(date: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))
}
