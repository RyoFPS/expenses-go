// Helper akses backend uji (stack docker compose terpisah `finance-e2e`, port 8100) untuk seed & verifikasi.
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"

export const API_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:8100"
export const COMPOSE_PROJECT = process.env.E2E_COMPOSE_PROJECT ?? "finance-e2e"
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..")

function envFile(): Record<string, string> {
  const text = readFileSync(path.join(REPO_ROOT, ".env"), "utf-8")
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
  )
}

export async function call<T = unknown>(method: string, p: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${API_URL}${p}`, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${text}`)
  return (text ? JSON.parse(text) : undefined) as T
}

export const api = {
  get: <T>(p: string) => call<T>("GET", `/api/v1${p}`),
  post: <T>(p: string, body?: unknown) => call<T>("POST", `/api/v1${p}`, body),
  patch: <T>(p: string, body?: unknown) => call<T>("PATCH", `/api/v1${p}`, body),
  ingest: (n: { package_name: string; title: string; text: string; posted_at: number }) =>
    call<{ status: string; raw_id?: string }>("POST", "/api/v1/ingest/notification", n, { "X-API-Key": envFile().API_KEY }),
}

/** Jalankan SQL di DB stack uji (hanya untuk reset & data yang tidak punya endpoint, mis. snapshot saldo). */
export function sql(statement: string): string {
  const env = envFile()
  return execFileSync(
    "docker",
    ["compose", "-p", COMPOSE_PROJECT, "exec", "-T", "db", "psql", "-qtA", "-U", env.POSTGRES_USER, "-d", env.POSTGRES_DB, "-c", statement],
    { cwd: REPO_ROOT, encoding: "utf-8" }
  ).trim()
}
