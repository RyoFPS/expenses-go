// Klien API. Semua request ke origin yang sama (/api/v1/*), diteruskan Next.js ke FastAPI
// (lihat next.config.ts), sehingga cookie Cloudflare Access ikut terkirim tanpa CORS.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

type Query = Record<string, string | number | boolean | undefined | null>

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v))
  }
  const qs = params.toString()
  return `/api/v1${path}${qs ? `?${qs}` : ""}`
}

/** Ubah body error FastAPI ({detail: string | [{msg, loc}]}) menjadi pesan yang bisa dibaca. */
export function errorMessage(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((d: { msg?: string; loc?: unknown[] }) => {
        const field = Array.isArray(d.loc) ? d.loc.filter((x) => x !== "body").join(".") : ""
        return field ? `${field}: ${d.msg}` : (d.msg ?? "")
      })
      .join("; ")
  }
  if (status === 401) return "Sesi login berakhir. Muat ulang halaman."
  return `Permintaan gagal (${status})`
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; query?: Query } = {}
): Promise<T> {
  const res = await fetch(buildUrl(path, init.query), {
    method: init.method ?? "GET",
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  })
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!res.ok) throw new ApiError(res.status, errorMessage(body, res.status))
  return body as T
}
