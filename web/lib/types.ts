// Tipe respons API backend (/api/v1). Nominal selalu integer rupiah, waktu ISO 8601 UTC.

export type AccountType = "bank" | "ewallet" | "cash"
export type TxType = "income" | "expense" | "transfer"
export type TxSource = "notification" | "manual" | "import"
export type CategoryType = "income" | "expense" | "transfer"
export type ParseStatus = "pending" | "parsed" | "ignored" | "failed"
export type RuleMatchType = "merchant_contains" | "regex"

export interface Account {
  id: string
  name: string
  type: AccountType
  package_name: string | null
  opening_balance: number
  is_active: boolean
  created_at: string
  balance: number
}

export interface SavingGoal {
  id: string
  account_id: string
  account_name: string
  name: string
  target_amount: number
  target_date: string | null
  balance: number
  remaining: number
  progress_percent: number
}

export interface AccountBalance {
  account_id: string
  calculated: number
  last_snapshot: { balance: number; observed_at: string; raw_notification_id: string | null } | null
  calculated_at_snapshot: number | null
  diff: number | null
}

export interface Category {
  id: string
  name: string
  type: CategoryType
  icon: string | null
  color: string | null
  parent_id: string | null
}

export interface CategoryRule {
  id: string
  match_type: RuleMatchType
  pattern: string
  category_id: string
  priority: number
}

export interface RawNotification {
  id: string
  package_name: string
  title: string
  text: string
  posted_at: string
  received_at: string
  parse_status: ParseStatus
  parse_error: string | null
}

export interface Transaction {
  id: string
  account_id: string
  to_account_id: string | null
  type: TxType
  amount: number
  fee: number
  merchant: string | null
  note: string | null
  category_id: string | null
  occurred_at: string
  source: TxSource
  raw_notification_id: string | null
  counter_raw_notification_id: string | null
  needs_review: boolean
  created_at: string
  updated_at: string
}

export interface TransactionDetail extends Transaction {
  raw_notification: RawNotification | null
  counter_raw_notification: RawNotification | null
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface MonthlySummary {
  month: string
  income: number
  expense: number
  fees: number
  net: number
  by_category: { category_id: string | null; name: string; type: CategoryType; total: number }[]
}

export interface Budget {
  id: string
  category_id: string
  category_name: string
  month: string
  amount: number
}

export interface Cashflow {
  date_from: string
  date_to: string
  group_by: "day" | "week" | "month"
  points: { period: string; income: number; expense: number; net: number }[]
}

export interface NetWorth {
  total: number
  accounts: { id: string; name: string; type: AccountType; is_active: boolean; balance: number }[]
}

export interface LatestNotification {
  received_at: string | null
}

export interface ListenerStatus {
  device_id: string
  listener_enabled: boolean
  pending_count: number
  failed_count: number
  app_version: string
  last_seen: string
  stale: boolean
}

export interface TransactionFilters {
  account_id?: string
  type?: TxType
  category_id?: string
  date_from?: string
  date_to?: string
  q?: string
  needs_review?: boolean
  page?: number
  page_size?: number
}

export interface TransactionInput {
  account_id: string
  to_account_id?: string | null
  type: TxType
  amount: number
  fee?: number
  merchant?: string | null
  note?: string | null
  category_id?: string | null
  occurred_at?: string
}
