import { defineConfig } from "@playwright/test"

// E2E terhadap build produksi (standalone) + backend uji terpisah (docker compose -p finance-e2e, port 8100).
// Build harus dibuat dengan API_INTERNAL_URL=http://127.0.0.1:8100 (lihat script "e2e" di package.json).
const PORT = Number(process.env.E2E_WEB_PORT ?? 3100)

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1, // satu DB bersama
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: process.env.E2E_BROWSER_CHANNEL ?? "msedge",
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile-375", use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: "node scripts/serve-standalone.mjs",
    url: `http://127.0.0.1:${PORT}/manifest.webmanifest`,
    env: { PORT: String(PORT), HOSTNAME: "127.0.0.1" },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
