import { Dashboard } from "@/components/dashboard"
import { serverGet } from "@/lib/server-api"
import type { Account, NetWorth, Page, Transaction } from "@/lib/types"

// Total saldo & akun dirender di server agar angka utama (LCP) sudah ada di HTML awal.
export default async function DashboardPage() {
  const [netWorth, accounts, review] = await Promise.all([
    serverGet<NetWorth>("/reports/net-worth"),
    serverGet<Account[]>("/accounts"),
    serverGet<Page<Transaction>>("/transactions?needs_review=true&page_size=1"),
  ])
  return <Dashboard initial={{ netWorth, accounts, reviewPage: review }} />
}
