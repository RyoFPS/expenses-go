import { TX_TYPE_LABEL, jakartaDate } from "@/lib/format"
import type { Transaction } from "@/lib/types"

const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
const textCell = (value: string | null) => cell(value && /^[=+\-@\t\r]/.test(value) ? `'${value}` : (value ?? ""))

export function transactionsCsv(
  transactions: Transaction[],
  accountName: (id: string | null) => string,
  categoryName: (id: string | null) => string
): string {
  return [
    ["Tanggal", "Akun", "Tipe", "Nominal (Rp)", "Merchant", "Kategori", "Catatan", "Biaya transfer (Rp)", "Akun tujuan"].map(cell),
    ...transactions.map((tx) => [
      cell(jakartaDate(new Date(tx.occurred_at))),
      textCell(accountName(tx.account_id)),
      cell(TX_TYPE_LABEL[tx.type]),
      cell(tx.amount),
      textCell(tx.merchant),
      textCell(categoryName(tx.category_id)),
      textCell(tx.note),
      cell(tx.fee),
      textCell(tx.to_account_id ? accountName(tx.to_account_id) : null),
    ]),
  ].map((row) => row.join(",")).join("\r\n")
}
