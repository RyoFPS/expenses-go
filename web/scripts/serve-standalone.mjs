// Menjalankan hasil `next build` (output: standalone) seperti di produksi/Docker:
// salin public/ dan .next/static ke folder standalone, lalu jalankan server.js.
import { cpSync, existsSync } from "node:fs"
import { spawn } from "node:child_process"

const root = ".next/standalone"
if (!existsSync(`${root}/server.js`)) {
  console.error("Belum ada build standalone. Jalankan `npm run build` dulu.")
  process.exit(1)
}
cpSync("public", `${root}/public`, { recursive: true })
cpSync(".next/static", `${root}/.next/static`, { recursive: true })
const child = spawn(process.execPath, ["server.js"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, PORT: process.env.PORT ?? "3000", HOSTNAME: process.env.HOSTNAME ?? "127.0.0.1" },
})
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig))
child.on("exit", (code) => process.exit(code ?? 0))
