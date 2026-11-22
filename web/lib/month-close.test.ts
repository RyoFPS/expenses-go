import { expect, it } from "vitest"

import { monthCloseStatus } from "@/lib/month-close"
import type { MonthClose } from "@/lib/types"

const empty: MonthClose = {
  month: "2026-11",
  needs_review: 0,
  failed_notifications: 0,
  uncategorized: 0,
  reconciliation: [],
}

it("tidak menyatakan siap saat akun belum punya snapshot", () => {
  const account = {
    account_id: "bank",
    name: "Bank",
    observed_at: null,
    diff: null,
  }
  expect(monthCloseStatus({ ...empty, reconciliation: [account] })).toBe(
    "unverified"
  )
  expect(
    monthCloseStatus({ ...empty, reconciliation: [{ ...account, diff: 0 }] })
  ).toBe("ready")
  expect(
    monthCloseStatus({ ...empty, reconciliation: [{ ...account, diff: -10 }] })
  ).toBe("pending")
  expect(
    monthCloseStatus({ ...empty, needs_review: 1, reconciliation: [account] })
  ).toBe("pending")
})
