# web — Dashboard (Next.js)

Dashboard PWA untuk Personal Finance Tracker. Lihat [README utama](../README.md) dan [PRD](../PRD.md) §13.

Dibuat dengan `npx shadcn@latest init --preset b39iRcInT --template next` (Next.js 16, shadcn/ui style `base-rhea` di atas Base UI, ikon Phosphor).

```bash
npm install
API_INTERNAL_URL=http://127.0.0.1:8000 npm run dev   # backend lokal harus jalan (AUTH_DISABLED=true)
npm test            # unit test (Vitest)
npm run lint && npm run typecheck
```

E2E (Playwright, pakai Microsoft Edge terpasang) memakai backend uji terpisah agar data dev aman:

```bash
# dari root repo
API_PORT=8100 docker compose -p finance-e2e up -d --build --wait db api
docker compose -p finance-e2e run --rm api alembic upgrade head
# dari web/
API_INTERNAL_URL=http://127.0.0.1:8100 npm run build
API_INTERNAL_URL=http://127.0.0.1:8100 npm run test:e2e   # 375px & 1280px; DB uji di-reset + di-seed otomatis
docker compose -p finance-e2e down -v                      # bersihkan
```
