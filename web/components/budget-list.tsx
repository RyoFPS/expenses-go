"use client"

import * as React from "react"

import { ErrorNote, ListSkeleton } from "@/components/common"
import { Money } from "@/components/money"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  useBudgets,
  useCategories,
  useDeleteBudget,
  useSaveBudget,
  useSummary,
} from "@/lib/queries"

export function BudgetList({ month }: { month: string }) {
  const budgets = useBudgets(month)
  const categories = useCategories()
  const summary = useSummary(month)
  const save = useSaveBudget()
  const remove = useDeleteBudget()
  const budgetItems = budgets.data ?? []
  const expenseCategories = categories.data?.filter((category) => category.type === "expense") ?? []
  const [categoryId, setCategoryId] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [editing, setEditing] = React.useState(false)
  const selectedCategoryId = categoryId || expenseCategories[0]?.id || ""
  const spending = new Map(
    summary.data?.by_category
      .filter((item) => item.type === "expense" && item.category_id)
      .map((item) => [item.category_id!, item.total]) ?? []
  )

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = Number(amount)
    if (!selectedCategoryId || !Number.isSafeInteger(value) || value < 0) return
    save.mutate(
      { categoryId: selectedCategoryId, month, amount: value },
      { onSuccess: () => setEditing(false) }
    )
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Anggaran pengeluaran</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {budgets.isLoading || categories.isLoading || summary.isLoading ? (
          <ListSkeleton rows={2} />
        ) : budgets.isError ? (
          <ErrorNote error={budgets.error} />
        ) : categories.isError ? (
          <ErrorNote error={categories.error} />
        ) : summary.isError ? (
          <ErrorNote error={summary.error} />
        ) : (
          <>
            {budgetItems.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Belum ada anggaran untuk bulan ini. Pilih kategori dan tetapkan batasnya.
              </p>
            )}
            <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <label className="sr-only" htmlFor="budget-category">Kategori pengeluaran</label>
              <select
                id="budget-category"
                value={selectedCategoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                disabled={expenseCategories.length === 0 || save.isPending}
                className="h-8 min-w-0 rounded-2xl bg-input/50 px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                {expenseCategories.length === 0 ? (
                  <option value="">Belum ada kategori pengeluaran</option>
                ) : (
                  expenseCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))
                )}
              </select>
              <label className="sr-only" htmlFor="budget-amount">Anggaran dalam rupiah</label>
              <Input
                id="budget-amount"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder="Anggaran (Rp)"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
              <Button type="submit" disabled={!selectedCategoryId || save.isPending}>
                {editing ? "Simpan perubahan" : "Atur anggaran"}
              </Button>
            </form>
            {budgetItems.map((budget) => {
              const used = spending.get(budget.category_id) ?? 0
              const remaining = budget.amount - used
              const exceeded = used > budget.amount
              return (
                <div key={budget.id} className="space-y-2 rounded-2xl bg-muted/40 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-medium">{budget.category_name}</h3>
                      {exceeded && (
                        <p role="status" className="text-xs font-medium text-destructive">
                          Anggaran terlampaui
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCategoryId(budget.category_id)
                        setAmount(String(budget.amount))
                        setEditing(true)
                      }}
                    >Ubah</Button>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`Progres anggaran ${budget.category_name}`}
                    aria-valuemin={0}
                    aria-valuemax={budget.amount || 1}
                    aria-valuenow={Math.min(used, budget.amount || 0)}
                    className="h-2 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className={`h-full rounded-full ${exceeded ? "bg-destructive" : "bg-primary"}`}
                      style={{
                        width: `${budget.amount ? Math.min(100, (used / budget.amount) * 100) : used ? 100 : 0}%`,
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs sm:text-sm">
                    <BudgetValue label="Anggaran" value={budget.amount} />
                    <BudgetValue label="Terpakai" value={used} />
                    <BudgetValue label="Sisa" value={remaining} exceeded={remaining < 0} />
                  </div>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ categoryId: budget.category_id, month })}
                  >
                    Hapus anggaran
                  </Button>
                </div>
              )
            })}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function BudgetValue({
  label,
  value,
  exceeded = false,
}: {
  label: string
  value: number
  exceeded?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground">{label}</p>
      <Money value={value} type={exceeded ? "expense" : "neutral"} className="font-medium" />
    </div>
  )
}
