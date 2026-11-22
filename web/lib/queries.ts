"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/lib/toast"

import { api, ApiError } from "@/lib/api"
import type {
  Account,
  AccountBalance,
  AccountType,
  Budget,
  Cashflow,
  Category,
  CategoryRule,
  CategoryType,
  LatestNotification,
  MonthlySummary,
  NetWorth,
  Page,
  ParseStatus,
  RawNotification,
  RuleMatchType,
  SavingGoal,
  Transaction,
  TransactionDetail,
  TransactionFilters,
  TransactionInput,
} from "@/lib/types"

export const keys = {
  accounts: ["accounts"] as const,
  balance: (id: string) => ["accounts", id, "balance"] as const,
  categories: ["categories"] as const,
  budgets: (month: string) => ["budgets", month] as const,
  savingGoals: ["saving-goals"] as const,
  rules: ["category-rules"] as const,
  transactions: (f?: TransactionFilters) => (f ? (["transactions", f] as const) : (["transactions"] as const)),
  transaction: (id: string) => ["transactions", "detail", id] as const,
  reports: ["reports"] as const,
  latestNotification: ["reports", "latest-notification"] as const,
  raw: (status?: ParseStatus) => (status ? (["raw", status] as const) : (["raw"] as const)),
}

// --- queries ----------------------------------------------------------------

/** Data awal dari server (SSR) agar angka utama tampil tanpa menunggu fetch di browser. */
export interface Initial<T> {
  initialData?: T
  initialDataUpdatedAt?: number
}

export const useAccounts = (init: Initial<Account[]> = {}) =>
  useQuery({ queryKey: keys.accounts, queryFn: () => api<Account[]>("/accounts"), ...init })

export const useAccountBalance = (id: string) =>
  useQuery({ queryKey: keys.balance(id), queryFn: () => api<AccountBalance>(`/accounts/${id}/balance`) })

export const useCategories = () =>
  useQuery({ queryKey: keys.categories, queryFn: () => api<Category[]>("/categories"), staleTime: 60_000 })

export const useRules = () => useQuery({ queryKey: keys.rules, queryFn: () => api<CategoryRule[]>("/category-rules") })

export const useTransactions = (filters: TransactionFilters) =>
  useQuery({
    queryKey: keys.transactions(filters),
    queryFn: () => api<Page<Transaction>>("/transactions", { query: { ...filters } }),
    placeholderData: keepPreviousData,
  })

export const useTransaction = (id: string) =>
  useQuery({ queryKey: keys.transaction(id), queryFn: () => api<TransactionDetail>(`/transactions/${id}`) })

export const useNeedsReviewCount = (init: Initial<Page<Transaction>> = {}) =>
  useQuery({
    ...init,
    queryKey: keys.transactions({ needs_review: true, page_size: 1 }),
    queryFn: () => api<Page<Transaction>>("/transactions", { query: { needs_review: true, page_size: 1 } }),
    select: (p) => p.total,
  })

export const useSummary = (month: string) =>
  useQuery({
    queryKey: [...keys.reports, "summary", month],
    queryFn: () => api<MonthlySummary>("/reports/summary", { query: { month } }),
  })

export const useBudgets = (month: string) =>
  useQuery({
    queryKey: keys.budgets(month),
    queryFn: () => api<Budget[]>("/budgets", { query: { month } }),
  })

export const useSavingGoals = () =>
  useQuery({ queryKey: keys.savingGoals, queryFn: () => api<SavingGoal[]>("/saving-goals") })

export function useSaveSavingGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ accountId, name, target_amount, target_date }: Omit<SavingGoal, "id" | "account_id" | "account_name" | "balance" | "remaining" | "progress_percent"> & { accountId: string }) =>
      api<SavingGoal>(`/saving-goals/${accountId}`, {
        method: "PUT",
        body: { name, target_amount, target_date },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.savingGoals }),
    onError,
  })
}

export function useDeleteSavingGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (accountId: string) => api<void>(`/saving-goals/${accountId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.savingGoals }),
    onError,
  })
}

export function useSaveBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ categoryId, month, amount }: { categoryId: string; month: string; amount: number }) =>
      api<Budget>(`/budgets/${categoryId}`, { method: "PUT", query: { month }, body: { amount } }),
    onSuccess: (_data, input) => qc.invalidateQueries({ queryKey: keys.budgets(input.month) }),
    onError,
  })
}

export function useDeleteBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ categoryId, month }: { categoryId: string; month: string }) =>
      api<void>(`/budgets/${categoryId}`, { method: "DELETE", query: { month } }),
    onSuccess: (_data, input) => qc.invalidateQueries({ queryKey: keys.budgets(input.month) }),
    onError,
  })
}

export const useCashflow = (dateFrom: string, dateTo: string, groupBy: "day" | "week" | "month") =>
  useQuery({
    queryKey: [...keys.reports, "cashflow", dateFrom, dateTo, groupBy],
    queryFn: () => api<Cashflow>("/reports/cashflow", { query: { date_from: dateFrom, date_to: dateTo, group_by: groupBy } }),
    placeholderData: keepPreviousData,
  })

export const useNetWorth = (init: Initial<NetWorth> = {}) =>
  useQuery({ queryKey: [...keys.reports, "net-worth"], queryFn: () => api<NetWorth>("/reports/net-worth"), ...init })

export const useLatestNotification = () =>
  useQuery({
    queryKey: keys.latestNotification,
    queryFn: () => api<LatestNotification>("/reports/latest-notification"),
    refetchInterval: 30_000,
  })

export const useRawNotifications = (status: ParseStatus) =>
  useQuery({
    queryKey: keys.raw(status),
    queryFn: () => api<Page<RawNotification>>("/raw-notifications", { query: { parse_status: status, page_size: 100 } }),
  })

// --- mutations ----------------------------------------------------------------

function onError(err: unknown) {
  toast.error(err instanceof ApiError ? err.message : "Terjadi kesalahan. Coba lagi.")
}

/** Setelah transaksi berubah: saldo, laporan, daftar transaksi & raw ikut basi. */
function useInvalidateMoney() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.transactions() }),
      qc.invalidateQueries({ queryKey: keys.accounts }),
      qc.invalidateQueries({ queryKey: keys.savingGoals }),
      qc.invalidateQueries({ queryKey: keys.reports }),
      qc.invalidateQueries({ queryKey: keys.raw() }),
    ])
}

export function useCreateTransaction() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (input: TransactionInput) => api<Transaction>("/transactions", { method: "POST", body: input }),
    onSuccess: invalidate,
    onError,
  })
}

export function useUpdateTransaction() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<TransactionInput> & { id: string }) =>
      api<Transaction>(`/transactions/${id}`, { method: "PATCH", body: patch }),
    onSuccess: invalidate,
    onError,
  })
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/transactions/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError,
  })
}

export function useMarkReviewed() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (id: string) => api<Transaction>(`/transactions/${id}/mark-reviewed`, { method: "POST" }),
    onSuccess: invalidate,
    onError,
  })
}

export function useReparse() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (id: string) => api<RawNotification>(`/raw-notifications/${id}/reparse`, { method: "POST" }),
    onSuccess: invalidate,
    onError,
  })
}

export function useReparseAll() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (status: ParseStatus) =>
      api<{ processed: number; by_status: Partial<Record<ParseStatus, number>> }>("/raw-notifications/reparse-all", {
        method: "POST",
        query: { parse_status: status },
      }),
    onSuccess: invalidate,
    onError,
  })
}

export interface AccountInput {
  name: string
  type: AccountType
  package_name: string | null
  opening_balance: number
  is_active: boolean
}

export function useSaveAccount() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: ({ id, ...body }: AccountInput & { id?: string }) =>
      id
        ? api<Account>(`/accounts/${id}`, { method: "PATCH", body })
        : api<Account>("/accounts", { method: "POST", body }),
    onSuccess: invalidate,
    onError,
  })
}

export function useReconcile() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (id: string) => api<Transaction>(`/accounts/${id}/reconcile`, { method: "POST" }),
    onSuccess: invalidate,
    onError,
  })
}

export interface CategoryInput {
  name: string
  type: CategoryType
  icon: string | null
  color: string | null
  parent_id: string | null
}

export function useSaveCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: CategoryInput & { id?: string }) =>
      id
        ? api<Category>(`/categories/${id}`, { method: "PATCH", body })
        : api<Category>("/categories", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.categories }),
    onError,
  })
}

export function useDeleteCategory() {
  const invalidate = useInvalidateMoney()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/categories/${id}`, { method: "DELETE" }),
    onSuccess: () =>
      Promise.all([
        invalidate(),
        qc.invalidateQueries({ queryKey: keys.categories }),
        qc.invalidateQueries({ queryKey: keys.rules }),
      ]),
    onError,
  })
}

export interface RuleInput {
  match_type: RuleMatchType
  pattern: string
  category_id: string
  priority: number
}

export function useSaveRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: RuleInput & { id?: string }) =>
      id
        ? api<CategoryRule>(`/category-rules/${id}`, { method: "PATCH", body })
        : api<CategoryRule>("/category-rules", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.rules }),
    onError,
  })
}

export function useDeleteRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/category-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.rules }),
    onError,
  })
}

export function useApplyRules() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: () => api<{ updated: number }>("/category-rules/apply", { method: "POST" }),
    onSuccess: invalidate,
    onError,
  })
}
