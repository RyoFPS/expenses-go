// Ambil data di server (Server Component) untuk render awal, meneruskan identitas Cloudflare Access
// milik pengguna ke FastAPI. Backend tetap memvalidasi JWT; tanpa header valid hasilnya 401 -> null.
import { headers } from "next/headers"

const API_URL = (process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "")
const FORWARDED = ["cf-access-jwt-assertion"] as const

/** Mengembalikan null jika gagal; halaman lalu memuat data seperti biasa di browser. */
export async function serverGet<T>(path: string): Promise<T | null> {
  const incoming = await headers()
  const forward: Record<string, string> = {}
  for (const h of FORWARDED) {
    const v = incoming.get(h)
    if (v) forward[h] = v
  }
  try {
    const res = await fetch(`${API_URL}/api/v1${path}`, {
      headers: forward,
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}
