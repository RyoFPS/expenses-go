"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { LightningIcon, PencilSimpleIcon, PlusIcon, TagIcon, TrashIcon } from "@phosphor-icons/react"
import * as React from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "@/lib/toast"
import { z } from "zod"

import { EmptyState, ErrorNote, ListSkeleton, PageHeader } from "@/components/common"
import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  useApplyRules,
  useCategories,
  useDeleteCategory,
  useDeleteRule,
  useRules,
  useSaveCategory,
  useSaveRule,
} from "@/lib/queries"
import type { Category, CategoryRule, CategoryType, RuleMatchType } from "@/lib/types"

const TYPE_LABEL = { expense: "Pengeluaran", income: "Pemasukan" } as const
const MATCH_LABEL = { merchant_contains: "Merchant mengandung", regex: "Regex merchant" } as const

export default function CategoriesPage() {
  const categories = useCategories()
  const [editingCat, setEditingCat] = React.useState<Category | CategoryType | null>(null)
  const del = useDeleteCategory()

  return (
    <>
      <PageHeader title="Kategori & aturan" />
      <div className="grid gap-6 lg:grid-cols-2">
        {(["expense", "income"] as const).map((type) => {
          const items = (categories.data ?? []).filter((c) => c.type === type)
          const byId = new Map(items.map((c) => [c.id, c]))
          return (
            <Card key={type}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{TYPE_LABEL[type]}</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setEditingCat(type)}>
                  <PlusIcon data-icon="inline-start" /> Tambah
                </Button>
              </CardHeader>
              <CardContent>
                {categories.isLoading ? (
                  <ListSkeleton rows={3} />
                ) : categories.isError ? (
                  <ErrorNote error={categories.error} />
                ) : items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada kategori.</p>
                ) : (
                  <ul className="divide-y">
                    {items.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 py-2">
                        <span
                          className="size-3 shrink-0 rounded-full"
                          style={{ background: c.color ?? "var(--muted-foreground)" }}
                          aria-hidden
                        />
                        <span className="flex-1 truncate">
                          {c.parent_id && byId.get(c.parent_id) && (
                            <span className="text-muted-foreground">{byId.get(c.parent_id)!.name} / </span>
                          )}
                          {c.name}
                        </span>
                        <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${c.name}`} onClick={() => setEditingCat(c)}>
                          <PencilSimpleIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Hapus ${c.name}`}
                          onClick={() => {
                            if (window.confirm(`Hapus kategori "${c.name}"? Transaksinya menjadi tanpa kategori.`)) {
                              del.mutate(c.id, { onSuccess: () => toast.success("Kategori dihapus") })
                            }
                          }}
                        >
                          <TrashIcon />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <RulesSection categories={categories.data ?? []} />
      <CategoryDialog value={editingCat} categories={categories.data ?? []} onClose={() => setEditingCat(null)} />
    </>
  )
}

const catSchema = z.object({
  name: z.string().trim().min(1, "Isi nama").max(100),
  type: z.enum(["income", "expense"]),
  color: z.string(),
  parentId: z.string(),
})

function CategoryDialog({
  value,
  categories,
  onClose,
}: {
  value: Category | CategoryType | null
  categories: Category[]
  onClose: () => void
}) {
  const save = useSaveCategory()
  const editing = typeof value === "object" ? value : null
  const form = useForm<z.infer<typeof catSchema>>({
    resolver: zodResolver(catSchema),
    defaultValues: { name: "", type: "expense", color: "#84cc16", parentId: "" },
  })
  React.useEffect(() => {
    if (value === null) return
    if (typeof value === "string") form.reset({ name: "", type: value, color: "#84cc16", parentId: "" })
    else form.reset({ name: value.name, type: value.type, color: value.color ?? "#84cc16", parentId: value.parent_id ?? "" })
  }, [value, form])
  const type = useWatch({ control: form.control, name: "type" })

  const onSubmit = form.handleSubmit(async (v) => {
    await save.mutateAsync({
      id: editing?.id,
      name: v.name,
      type: v.type,
      color: v.color || null,
      icon: editing?.icon ?? null,
      parent_id: v.parentId || null,
    })
    toast.success(editing ? "Kategori diperbarui" : "Kategori dibuat")
    onClose()
  })

  return (
    <Dialog open={value !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Ubah kategori" : "Tambah kategori"}</DialogTitle>
          <DialogDescription>{TYPE_LABEL[type]}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field data-invalid={!!form.formState.errors.name || undefined}>
            <FieldLabel htmlFor="c-name">Nama</FieldLabel>
            <Input id="c-name" className="h-10" placeholder="mis. Makanan" {...form.register("name")} />
            <FieldError errors={[form.formState.errors.name]} />
          </Field>
          <Controller
            control={form.control}
            name="parentId"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="c-parent">Induk (opsional)</FieldLabel>
                <OptionSelect
                  id="c-parent"
                  value={field.value}
                  onChange={field.onChange}
                  emptyLabel="Tanpa induk"
                  options={categories
                    .filter((c) => c.type === type && c.id !== editing?.id)
                    .map((c) => ({ value: c.id, label: c.name }))}
                />
              </Field>
            )}
          />
          <Field>
            <FieldLabel htmlFor="c-color">Warna</FieldLabel>
            <Input id="c-color" type="color" className="h-10 w-20 p-1" {...form.register("color")} />
          </Field>
          <Button type="submit" disabled={save.isPending}>
            Simpan
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RulesSection({ categories }: { categories: Category[] }) {
  const rules = useRules()
  const apply = useApplyRules()
  const del = useDeleteRule()
  const [editing, setEditing] = React.useState<CategoryRule | "new" | null>(null)
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—"

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Aturan auto-kategori</CardTitle>
          <CardDescription>Dicocokkan ke merchant transaksi baru; prioritas tertinggi menang.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={apply.isPending || !rules.data?.length}
            onClick={() => apply.mutate(undefined, { onSuccess: (r) => toast.success(`${r.updated} transaksi dikategorikan`) })}
          >
            <LightningIcon data-icon="inline-start" /> Terapkan ke yang tanpa kategori
          </Button>
          <Button size="sm" onClick={() => setEditing("new")} disabled={categories.length === 0}>
            <PlusIcon data-icon="inline-start" /> Aturan
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {rules.isLoading ? (
          <ListSkeleton rows={2} />
        ) : !rules.data?.length ? (
          <EmptyState
            icon={TagIcon}
            title="Belum ada aturan"
            description='Contoh: merchant mengandung "kopi" → kategori Makanan.'
            className="border-0 py-6"
          />
        ) : (
          <ul className="divide-y">
            {rules.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Badge variant="outline" className="money">
                  P{r.priority}
                </Badge>
                <span className="text-muted-foreground">{MATCH_LABEL[r.match_type]}</span>
                <code className="rounded-md bg-muted px-1.5 py-0.5">{r.pattern}</code>
                <span aria-hidden>→</span>
                <span className="font-medium">{catName(r.category_id)}</span>
                <span className="ml-auto flex">
                  <Button variant="ghost" size="icon-sm" aria-label="Ubah aturan" onClick={() => setEditing(r)}>
                    <PencilSimpleIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Hapus aturan"
                    onClick={() => del.mutate(r.id, { onSuccess: () => toast.success("Aturan dihapus") })}
                  >
                    <TrashIcon />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <RuleDialog value={editing} categories={categories} onClose={() => setEditing(null)} />
    </Card>
  )
}

const ruleSchema = z
  .object({
    matchType: z.enum(["merchant_contains", "regex"]),
    pattern: z.string().trim().min(1, "Isi pola").max(200),
    categoryId: z.string().min(1, "Pilih kategori"),
    priority: z.string().regex(/^-?\d+$/, "Angka bulat"),
  })
  .superRefine((v, ctx) => {
    if (v.matchType === "regex") {
      try {
        new RegExp(v.pattern)
      } catch {
        ctx.addIssue({ code: "custom", path: ["pattern"], message: "Regex tidak valid" })
      }
    }
  })

function RuleDialog({
  value,
  categories,
  onClose,
}: {
  value: CategoryRule | "new" | null
  categories: Category[]
  onClose: () => void
}) {
  const save = useSaveRule()
  const editing = value && value !== "new" ? value : null
  const form = useForm<z.infer<typeof ruleSchema>>({
    resolver: zodResolver(ruleSchema),
    defaultValues: { matchType: "merchant_contains", pattern: "", categoryId: "", priority: "0" },
  })
  React.useEffect(() => {
    if (value === "new") form.reset({ matchType: "merchant_contains", pattern: "", categoryId: "", priority: "0" })
    else if (value)
      form.reset({ matchType: value.match_type, pattern: value.pattern, categoryId: value.category_id, priority: String(value.priority) })
  }, [value, form])

  const onSubmit = form.handleSubmit(async (v) => {
    await save.mutateAsync({
      id: editing?.id,
      match_type: v.matchType,
      pattern: v.pattern,
      category_id: v.categoryId,
      priority: Number(v.priority),
    })
    toast.success("Aturan disimpan")
    onClose()
  })

  return (
    <Dialog open={value !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Ubah aturan" : "Tambah aturan"}</DialogTitle>
          <DialogDescription>Tidak berlaku untuk transfer.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Controller
            control={form.control}
            name="matchType"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="r-type">Cara mencocokkan</FieldLabel>
                <OptionSelect
                  id="r-type"
                  value={field.value}
                  onChange={(v) => field.onChange(v as RuleMatchType)}
                  options={(Object.keys(MATCH_LABEL) as RuleMatchType[]).map((m) => ({ value: m, label: MATCH_LABEL[m] }))}
                />
              </Field>
            )}
          />
          <Field data-invalid={!!form.formState.errors.pattern || undefined}>
            <FieldLabel htmlFor="r-pattern">Pola</FieldLabel>
            <Input id="r-pattern" className="h-10 font-mono text-sm" {...form.register("pattern")} />
            <FieldDescription>Tidak membedakan huruf besar/kecil.</FieldDescription>
            <FieldError errors={[form.formState.errors.pattern]} />
          </Field>
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="r-cat">Kategori</FieldLabel>
                <OptionSelect
                  id="r-cat"
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Pilih kategori"
                  options={categories.map((c) => ({ value: c.id, label: `${c.name} (${TYPE_LABEL[c.type]})` }))}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Field data-invalid={!!form.formState.errors.priority || undefined}>
            <FieldLabel htmlFor="r-priority">Prioritas</FieldLabel>
            <Input id="r-priority" inputMode="numeric" className="h-10 w-28" {...form.register("priority")} />
            <FieldError errors={[form.formState.errors.priority]} />
          </Field>
          <Button type="submit" disabled={save.isPending}>
            Simpan
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
