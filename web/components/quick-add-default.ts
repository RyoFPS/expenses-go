import type { Account } from "@/lib/types"

/** Akun default: terakhir dipakai → akun tunai aktif → akun aktif pertama. */
export function pickDefaultAccount(accounts: Account[], lastId: string | null): string {
  const active = accounts.filter((a) => a.is_active)
  return (
    active.find((a) => a.id === lastId)?.id ?? active.find((a) => a.type === "cash")?.id ?? active[0]?.id ?? ""
  )
}
