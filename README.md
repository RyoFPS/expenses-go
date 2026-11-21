# Personal Finance Tracker

Pencatat keuangan pribadi self-hosted dengan auto-capture dari notifikasi Android. Spesifikasi lengkap: [PRD.md](PRD.md). Keputusan desain: [docs/DECISIONS.md](docs/DECISIONS.md).

Status: **M0**–**M4** selesai (fondasi, ingest, parser & transaksi, API inti, listener Android).

## Struktur

```
backend/    FastAPI (Python 3.12), SQLAlchemy async, Alembic, pytest
web/        Next.js dashboard (M5)
android/    Listener app Kotlin (M4)
docs/       Dokumentasi & keputusan
```

## Menjalankan (Docker)

Prasyarat: Docker + Docker Compose. `make` opsional (perintah setara tertulis di bawah).

```bash
cp .env.example .env          # lalu ganti POSTGRES_PASSWORD dan API_KEY
make up                       # docker compose up -d --build --wait
make migrate                  # docker compose run --rm api alembic upgrade head
curl http://127.0.0.1:8000/healthz   # {"status":"ok"}
```

Dokumentasi API interaktif: http://127.0.0.1:8000/docs

## Ingest notifikasi (M1)

```bash
curl -X POST http://127.0.0.1:8000/api/v1/ingest/notification \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"package_name":"com.example.bank","title":"...","text":"...","posted_at":1763700000123}'
```

- `202 {"status":"accepted","raw_id":"..."}`: baru disimpan.
- `200 {"status":"duplicate"}`: notifikasi yang sama sudah pernah diterima.
- `401`: API key salah/tidak ada. `422`: payload tidak valid.
- Batch (maks 100): `POST /api/v1/ingest/notification/batch` dengan body array.

## Parser notifikasi (M2)

Setiap raw notifikasi diparse menjadi transaksi. Agar notifikasi tercatat:

1. Parser untuk `package_name` app tersebut harus ada (`backend/app/parsers/`). Saat ini: **myBCA**.
2. Harus ada tepat satu akun aktif dengan `package_name` yang sama di tabel `accounts`.

Status raw: `parsed` (jadi transaksi/duplikat), `ignored` (bukan transaksi / app tanpa parser),
`failed` (format tidak dikenal atau akun belum ada, lihat `parse_error`). Parser hanya boleh ditulis
dari notifikasi asli di `backend/tests/fixtures/<sumber>/`.

## API (M3)

Dokumentasi lengkap: http://127.0.0.1:8000/docs. Ringkasan (prefix `/api/v1`):

| Area | Endpoint |
|---|---|
| Akun | `GET/POST /accounts`, `PATCH /accounts/{id}`, `GET /accounts/{id}/balance`, `POST /accounts/{id}/reconcile` |
| Transaksi | `GET/POST /transactions`, `GET/PATCH/DELETE /transactions/{id}`, `POST /transactions/{id}/mark-reviewed` |
| Kategori | CRUD `/categories`, CRUD `/category-rules`, `POST /category-rules/apply` |
| Raw | `GET /raw-notifications`, `POST /raw-notifications/{id}/reparse`, `POST /raw-notifications/reparse-all` |
| Laporan | `GET /reports/summary`, `GET /reports/cashflow`, `GET /reports/net-worth` |

Auth: endpoint selain ingest & `/healthz` butuh Cloudflare Access (`Cf-Access-Jwt-Assertion`).
Untuk lokal set `ENV=dev` dan `AUTH_DISABLED=true`. Di luar itu `CF_ACCESS_TEAM_DOMAIN` dan `CF_ACCESS_AUD` wajib diisi.

## Android listener (M4)

App Kotlin di `android/` yang menangkap notifikasi dari app bank/e-wallet terpilih dan mengirim teks mentahnya ke
`/api/v1/ingest/notification/batch`. Tidak ada parsing di Android.

Build (butuh JDK 17+ dan Android SDK; Android Studio sudah menyediakan keduanya):

```bash
cd android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk (boleh HTTP, untuk uji lokal)
./gradlew assembleRelease      # HTTPS saja; perlu signing config sendiri
./gradlew testDebugUnitTest    # unit test
```

Setup di HP:
1. Install APK, buka app.
2. Tab **Status** → "Buka pengaturan akses notifikasi" → aktifkan Finance Listener. Android 13+: jika tombolnya
   abu-abu, buka Info aplikasi → ⋮ → "Izinkan setelan terbatas" dulu.
3. Kecualikan app dari optimasi baterai (dan aktifkan Autostart di HP Xiaomi/Oppo/Vivo/Samsung).
4. Tab **Server**: URL server, API key (`API_KEY` di `.env`), serta `CF-Access-Client-Id/Secret` (service token Cloudflare, M6).
5. Tab **Aplikasi**: centang app bank/e-wallet. Tab **Outbox** menampilkan status kirim dan tombol kirim ulang.

Secret disimpan di EncryptedSharedPreferences di HP, tidak pernah di repo.

## Test

```bash
make test                     # docker compose run --rm api pytest -q
```

Test membuat database `<POSTGRES_DB>_test` sendiri dan menghapusnya setelah selesai.

## Migrasi baru

```bash
make revision m="deskripsi perubahan"
```

Selalu periksa file hasil autogenerate (mis. tipe ENUM tidak otomatis di-drop di `downgrade`).

## Perintah lain

| Perintah | Fungsi |
|---|---|
| `make down` | Hentikan semua container (data DB tetap di volume `db_data`) |
| `make logs` | Ikuti log API |
