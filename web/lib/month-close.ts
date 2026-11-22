import type { MonthClose } from "@/lib/types"

export function monthCloseStatus(
  data: MonthClose
): "pending" | "unverified" | "ready" {
  if (
    data.needs_review ||
    data.failed_notifications ||
    data.uncategorized ||
    data.reconciliation.some(
      (account) => account.diff !== null && account.diff !== 0
    )
  )
    return "pending"
  return data.reconciliation.some((account) => account.diff === null)
    ? "unverified"
    : "ready"
}
