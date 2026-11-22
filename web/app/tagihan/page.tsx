"use client"

import { CalendarIcon } from "@phosphor-icons/react"
import { toast } from "@/lib/toast"

import { EmptyState, ErrorNote, ListSkeleton, PageHeader } from "@/components/common"
import { Money } from "@/components/money"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { formatDate } from "@/lib/format"
import { useDecideRecurringBill, useRecurringBills } from "@/lib/queries"
import type { RecurringBill } from "@/lib/types"

const dateLabel = (date: string) => formatDate(`${date}T00:00:00+07:00`)

export default function RecurringBillsPage() {
  const bills = useRecurringBills()
  const decide = useDecideRecurringBill()

  function decision(bill: RecurringBill, status: "confirmed" | "ignored") {
    decide.mutate({ account_id: bill.account_id, merchant: bill.merchant, status }, {
      onSuccess: () => toast.success(status === "confirmed" ? "Tagihan dikonfirmasi" : "Kandidat diabaikan"),
    })
  }

  return (
    <>
      <PageHeader title="Tagihan rutin" description="Pola bulanan dari transaksi pengeluaran. Konfirmasi kandidat yang benar; tidak ada transaksi yang dibuat otomatis." />
      {bills.isLoading ? <ListSkeleton /> : bills.isError ? <ErrorNote error={bills.error} /> : (
        <div className="space-y-8">
          <section aria-labelledby="candidate-heading">
            <h2 id="candidate-heading" className="mb-3 text-lg font-semibold">Perlu ditinjau</h2>
            {!bills.data?.candidates.length ? (
              <EmptyState icon={CalendarIcon} title="Belum ada kandidat" description="Kandidat muncul setelah ada pengeluaran dari merchant dan akun yang sama selama tiga bulan berturut-turut." />
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {bills.data.candidates.map((bill) => (
                  <li key={`${bill.account_id}:${bill.merchant}`}>
                    <BillCard bill={bill} />
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" disabled={decide.isPending} onClick={() => decision(bill, "confirmed")}>Konfirmasi</Button>
                      <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decision(bill, "ignored")}>Abaikan</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="confirmed-heading">
            <h2 id="confirmed-heading" className="mb-3 text-lg font-semibold">Tagihan terkonfirmasi</h2>
            {!bills.data?.confirmed.length ? (
              <p className="text-sm text-muted-foreground">Belum ada tagihan yang dikonfirmasi.</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {bills.data.confirmed.map((bill) => <li key={`${bill.account_id}:${bill.merchant}`}><BillCard bill={bill} /></li>)}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  )
}

function BillCard({ bill }: { bill: RecurringBill }) {
  return (
    <Card>
      <CardContent className="space-y-2">
        <div>
          <p className="font-medium">{bill.display_merchant}</p>
          <p className="text-sm text-muted-foreground">{bill.account_name}</p>
        </div>
        <p><Money value={bill.estimated_amount} /> <span className="text-sm text-muted-foreground">/ bulan (perkiraan)</span></p>
        <p className="text-sm text-muted-foreground">Terakhir: {dateLabel(bill.last_date)} · Berikutnya: {dateLabel(bill.next_date)}</p>
      </CardContent>
    </Card>
  )
}
