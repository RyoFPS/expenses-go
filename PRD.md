# PRD: Personal Finance Tracker (Self-Hosted, Auto-Capture)

> Dokumen ini ditulis untuk dikerjakan oleh **agentic AI** (Claude Code, dll.). Kerjakan per milestone, ikuti acceptance criteria, dan jangan menambah fitur di luar scope.

---

## 1. Ringkasan

Aplikasi pencatatan keuangan **pribadi (single-user)** yang di-host di server sendiri, dengan pencatatan transaksi **otomatis** dari notifikasi mobile banking dan e-wallet di HP Android. Hanya pengeluaran **cash** yang diinput manual.

**Latar belakang:** Sebelumnya pengguna memakai Firefly III yang membaca email. Masalahnya: email hanya mengirim notifikasi pengeluaran, sehingga **pemasukan tidak tercatat**. UI/UX Firefly III juga kurang cocok. Solusi: membaca **notifikasi HP** (mencakup pemasukan dan pengeluaran) dan membuat UI sendiri.

## 2. Tujuan

1. Semua transaksi (masuk dan keluar) dari bank dan e-wallet tercatat otomatis tanpa input manual.
2. Saldo tiap akun selalu terlihat dan bisa direkonsiliasi dengan saldo asli.
3. Input cash cepat (kurang dari 5 detik).
4. Data 100% di server milik sendiri.
5. UI bersih, cepat, dan nyaman dipakai di HP maupun desktop.

## 3. Non-Goals (JANGAN dikerjakan)

- Multi-user, registrasi publik, atau billing.
- Integrasi API resmi open banking / agregator pihak ketiga.
- Scraping atau login otomatis ke internet banking.
- Dukungan iOS untuk listener (iOS tidak mengizinkan).
- Multi-currency (hanya IDR).
- Investasi, kripto, atau hutang-piutang (bisa fase berikutnya).

## 4. Pengguna

Satu pengguna: pemilik aplikasi (mahasiswa, HP Android, server sendiri).

## 5. Arsitektur

```
HP Android (Kotlin: NotificationListenerService + WorkManager)
        │  HTTPS POST (header Cloudflare Access service token + API key)
        ▼
Cloudflare (Access + WAF + rate limit)
        │  Cloudflare Tunnel
        ▼
cloudflared ──► FastAPI ──► PostgreSQL
                  ▲
                  │  HTTPS (via Cloudflare Access login)
        Web Dashboard (Next.js, PWA)
```

Prinsip:
- Listener **tidak** menulis ke DB langsung. Ia hanya mengirim **teks notifikasi mentah** ke API.
- Backend menyimpan data mentah dulu, baru mem-parse, sehingga parser bisa diperbaiki dan data diproses ulang.
- PostgreSQL tidak diekspos ke luar jaringan Docker.

## 6. Tech Stack

| Bagian | Teknologi |
|---|---|
| Backend | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.x (async), Alembic |
| Database | PostgreSQL 16 |
| Background job | APScheduler (in-process) |
| Frontend | Next.js (App Router, TypeScript), Tailwind CSS, shadcn/ui |
| Data fetching & form | TanStack Query, TanStack Table, React Hook Form, Zod |
| Chart | Recharts |
| Android | Kotlin, NotificationListenerService, WorkManager, Room, Retrofit/OkHttp, EncryptedSharedPreferences |
| Infra | Docker Compose, Cloudflare Tunnel (`cloudflared`), Caddy tidak diperlukan |
| Test | pytest + httpx (backend), Vitest/Playwright (frontend), JUnit (parser Android jika ada) |

## 7. Struktur Repo (monorepo)

```
Expenses GO/
├── PRD.md
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/          # config, security, db
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── api/           # routers
│   │   ├── services/      # business logic (ingest, balance, dedup)
│   │   └── parsers/       # satu modul per bank/e-wallet
│   ├── alembic/
│   ├── tests/
│   │   └── fixtures/      # contoh notifikasi mentah
│   └── pyproject.toml
├── web/                   # Next.js
├── android/               # Kotlin listener app
└── docs/
```

## 8. Model Data

Semua nominal disimpan sebagai **BIGINT dalam rupiah** (tanpa desimal). **Dilarang memakai float.** Semua timestamp `TIMESTAMPTZ` (UTC), tampilkan dalam `Asia/Jakarta`.

### `accounts`
| Kolom | Tipe | Catatan |
|---|---|---|
| id | UUID PK | |
| name | text | mis. "Jago", "GoPay", "Cash" |
| type | enum(`bank`,`ewallet`,`cash`) | |
| package_name | text null | package Android sumber notifikasi |
| opening_balance | bigint | default 0 |
| is_active | bool | |
| created_at | timestamptz | |

### `categories`
`id`, `name`, `type` (`income`/`expense`), `icon`, `color`, `parent_id` null.

### `raw_notifications`
| Kolom | Tipe | Catatan |
|---|---|---|
| id | UUID PK | |
| package_name | text | |
| title | text | |
| text | text | isi mentah, jangan dimodifikasi |
| posted_at | timestamptz | waktu dari Android |
| received_at | timestamptz | waktu server |
| content_hash | text UNIQUE | sha256(package+title+text+posted_at) untuk cegah kiriman ganda |
| parse_status | enum(`pending`,`parsed`,`ignored`,`failed`) | |
| parse_error | text null | |

### `transactions`
| Kolom | Tipe | Catatan |
|---|---|---|
| id | UUID PK | |
| account_id | UUID FK | akun sumber |
| to_account_id | UUID FK null | hanya untuk `transfer` |
| type | enum(`income`,`expense`,`transfer`) | |
| amount | bigint | selalu positif |
| fee | bigint | default 0 (biaya admin transfer) |
| merchant | text null | |
| note | text null | |
| category_id | UUID FK null | |
| occurred_at | timestamptz | |
| source | enum(`notification`,`manual`,`import`) | |
| raw_notification_id | UUID FK null | |
| dedup_hash | text UNIQUE null | lihat bagian 10 |
| needs_review | bool | true jika parser kurang yakin |
| created_at, updated_at | timestamptz | |

### `balance_snapshots`
`id`, `account_id`, `balance` (bigint), `observed_at`, `raw_notification_id`. Dipakai untuk rekonsiliasi saat notifikasi memuat saldo.

### `category_rules`
`id`, `match_type` (`merchant_contains`/`regex`), `pattern`, `category_id`, `priority`. Dipakai untuk auto-kategori.

### Perhitungan saldo
`current_balance = opening_balance + Σ(income) − Σ(expense) − Σ(transfer keluar + fee) + Σ(transfer masuk)` per akun.
Saldo tampilan dihitung dari transaksi; `balance_snapshots` dipakai untuk **mendeteksi selisih** (lihat bagian 11).

## 9. API Spec (backend)

Prefix: `/api/v1`. Semua respons JSON. Error format: `{"detail": "..."}`.

### Ingest (dipakai Android)
- `POST /ingest/notification`
  - Header: `X-API-Key`, serta header Cloudflare Access (divalidasi di edge).
  - Body: `{ "package_name": str, "title": str, "text": str, "posted_at": int(epoch ms) }`
  - Perilaku: validasi key → hitung `content_hash` → jika sudah ada, return `200 {"status":"duplicate"}` → simpan raw → jalankan parser → buat transaksi → return `202 {"status":"accepted","raw_id":...}`.
  - Harus **idempoten**: kiriman ulang tidak boleh membuat data ganda.
- `POST /ingest/notification/batch`: array body di atas (maks 100), untuk sinkronisasi antrian offline.

### Accounts
`GET /accounts`, `POST /accounts`, `PATCH /accounts/{id}`, `GET /accounts/{id}/balance` (saldo terhitung + snapshot terakhir + selisih).

### Transactions
- `GET /transactions` dengan filter: `account_id`, `type`, `category_id`, `date_from`, `date_to`, `q`, `needs_review`, `page`, `page_size`.
- `POST /transactions` (input manual / cash).
- `PATCH /transactions/{id}`, `DELETE /transactions/{id}`.
- `POST /transactions/{id}/mark-reviewed`.

### Categories & Rules
CRUD `/categories`, CRUD `/category-rules`, `POST /category-rules/apply` (jalankan ulang ke transaksi tanpa kategori).

### Raw / Reprocess
- `GET /raw-notifications?parse_status=failed`
- `POST /raw-notifications/{id}/reparse`
- `POST /raw-notifications/reparse-all?parse_status=failed`

### Reports
- `GET /reports/summary?month=YYYY-MM` → total masuk, keluar, net, per kategori.
- `GET /reports/cashflow?date_from&date_to&group_by=day|week|month`
- `GET /reports/net-worth` → total saldo semua akun.

### Auth
Dashboard dilindungi **Cloudflare Access**. Backend memvalidasi header `Cf-Access-Jwt-Assertion` (JWKS Cloudflare) untuk endpoint non-ingest. Untuk dev lokal, sediakan flag `AUTH_DISABLED=true` (hanya boleh aktif jika `ENV=dev`).

## 10. Parser Notifikasi

Lokasi: `backend/app/parsers/`. Satu modul per sumber, semua mengimplementasikan interface:

```python
class ParsedTransaction(BaseModel):
    type: Literal["income", "expense", "transfer"]
    amount: int
    merchant: str | None
    occurred_at: datetime | None   # fallback ke posted_at
    balance_after: int | None      # jika notifikasi memuat saldo
    counterpart_hint: str | None   # mis. nama akun tujuan untuk transfer
    confidence: float              # 0..1

class Parser(Protocol):
    package_names: set[str]
    def parse(self, title: str, text: str) -> ParsedTransaction | None: ...
```

Aturan:
- Registry memetakan `package_name` → parser. Package tak dikenal → `parse_status = ignored`.
- `parse` mengembalikan `None` untuk notifikasi non-transaksi (promo, OTP, info) → `ignored`.
- Jika `confidence < 0.8` → buat transaksi dengan `needs_review = true`.
- Parsing nominal: tangani `Rp 1.500.000`, `Rp1.500.000,00`, `IDR 25,000`. Hapus pemisah ribuan dengan benar; jangan salah baca desimal.
- **Jangan menebak format.** Pola regex ditulis berdasarkan **fixture notifikasi asli** di `tests/fixtures/<sumber>/*.json`. Jika fixture belum ada untuk suatu sumber, buat parser kerangka dengan TODO dan test yang ditandai `xfail`, jangan mengarang format.
- Setiap parser wajib punya unit test dengan minimal: 1 pemasukan, 1 pengeluaran, 1 transfer (jika ada), 1 notifikasi non-transaksi, 1 format nominal berbeda.

### Deduplikasi transaksi
`dedup_hash = sha256(account_id | type | amount | merchant_normalized | occurred_at dibulatkan ke menit)`.
Saat insert melanggar unique, abaikan dan tandai raw sebagai `parsed` (duplikat). Kasus top up (bank keluar + e-wallet masuk): jika ada dua transaksi berlawanan dengan nominal sama dalam jendela 2 menit pada dua akun berbeda, gabungkan menjadi satu `transfer` (service `transfer_matcher`, jalan setelah setiap ingest).

## 11. Rekonsiliasi Saldo

- Saat parser menghasilkan `balance_after`, simpan ke `balance_snapshots`.
- `GET /accounts/{id}/balance` mengembalikan `calculated`, `last_snapshot`, `diff`.
- Jika `diff != 0`, dashboard menampilkan peringatan "Saldo tidak cocok" di akun tersebut, dengan tombol **"Buat transaksi penyesuaian"** (membuat transaksi `source=manual`, kategori "Penyesuaian saldo").

## 12. Android Listener App

Fungsi tunggal: tangkap notifikasi dari daftar app yang diizinkan dan kirim ke backend.

Requirement:
1. `NotificationListenerService` yang menyaring berdasarkan `package_name` dari daftar yang bisa diatur di layar Settings app (default kosong, pengguna memilih dari app terinstal).
2. Ambil `EXTRA_TITLE`, `EXTRA_TEXT`, dan `EXTRA_BIG_TEXT` jika ada (gunakan yang terpanjang sebagai `text`), serta `postTime`.
3. Simpan ke **Room** dulu (outbox), lalu kirim lewat **WorkManager** dengan constraint network, exponential backoff, dan retry tanpa batas sampai berhasil.
4. Kirim via HTTPS dengan header `X-API-Key`, `CF-Access-Client-Id`, `CF-Access-Client-Secret`. Simpan secret di `EncryptedSharedPreferences`; **dilarang hardcode** dan dilarang masuk Git.
5. Layar minimal: (a) status izin notification access + tombol buka pengaturan, (b) pilih app yang dipantau, (c) isi URL server + key, (d) daftar outbox (pending/terkirim/gagal) dengan tombol "kirim ulang", (e) petunjuk mematikan battery optimization.
6. Tidak ada logika parsing di Android.
7. minSdk 26, targetSdk terbaru yang stabil.

## 13. Web Dashboard

Next.js (TypeScript) PWA, responsif, **mobile-first**, dark/light mode. Bahasa UI: Indonesia. Format uang: `Rp 1.500.000`.

Halaman:
1. **Dashboard**: total saldo, saldo per akun (kartu), ringkasan bulan ini (masuk/keluar/net), chart arus kas, pengeluaran per kategori, daftar transaksi terbaru, badge jumlah transaksi `needs_review`.
2. **Transaksi**: tabel dengan filter (tanggal, akun, kategori, tipe, pencarian), edit inline kategori, hapus, halaman detail transaksi yang menampilkan teks notifikasi mentah.
3. **Tambah cepat (cash)**: bottom sheet/FAB: nominal, kategori, catatan, tanggal default sekarang. Kurang dari 5 detik untuk satu entri.
4. **Review**: daftar transaksi `needs_review` dan raw `failed` dengan aksi koreksi / reparse.
5. **Akun**: CRUD akun, saldo hitung vs snapshot, tombol penyesuaian saldo.
6. **Kategori & Aturan**: CRUD kategori, aturan auto-kategori.
7. **Laporan**: per bulan, per kategori, tren.

UI guidelines: bersih dan lega, angka besar mudah dibaca, warna konsisten (hijau pemasukan, merah pengeluaran), skeleton loading, empty state yang jelas, aksesibilitas dasar (kontras, label). Jangan memakai template dashboard generik; rancang tampilan yang terasa personal dan ringan.

## 14. Keamanan

- Cloudflare Tunnel; tidak ada port publik terbuka; PostgreSQL hanya di jaringan Docker internal.
- Cloudflare Access: service token untuk `/api/v1/ingest/*`, login (email OTP/Google) untuk dashboard.
- `X-API-Key` dibandingkan dengan `secrets.compare_digest`.
- Rate limit pada ingest (Cloudflare WAF + opsional `slowapi`).
- Secret hanya lewat environment variable; sediakan `.env.example`, **jangan commit `.env`**.
- Jangan log isi notifikasi lengkap di level INFO (berisi data finansial); log hanya id dan status.
- Validasi semua input dengan Pydantic; query hanya lewat ORM/parameterized.
- Backup: `pg_dump` terjadwal harian (cron container) ke volume terpisah, simpan 14 hari; dokumentasikan cara restore.

## 15. Deployment

`docker-compose.yml` berisi service: `db` (postgres, volume persisten, tanpa port publik), `api` (FastAPI via uvicorn), `web` (Next.js), `cloudflared` (token dari env), `backup` (pg_dump cron).
Sediakan `Makefile` / skrip: `make up`, `make migrate`, `make test`, `make backup`.
Health check: `GET /healthz` pada API.

## 16. Milestone & Acceptance Criteria

Kerjakan **berurutan**. Jangan lanjut ke milestone berikutnya sebelum acceptance criteria terpenuhi dan test hijau.

### M0: Fondasi
- Skeleton repo, Docker Compose (db + api), Alembic, konfigurasi, `/healthz`.
- **AC:** `docker compose up` berjalan; `GET /healthz` = 200; migrasi awal membuat semua tabel di bagian 8.

### M1: Ingest & penyimpanan mentah
- Endpoint `/ingest/notification` dan `/batch`, validasi API key, idempotensi via `content_hash`, simpan ke `raw_notifications`.
- **AC:** kiriman sama dua kali tidak membuat dua baris; key salah = 401; payload tidak valid = 422; test pytest lulus.

### M2: Parser framework & transaksi
- Interface parser, registry, service ingest yang membuat `transactions`, dedup hash, auto-kategori dasar, transfer matcher.
- Kerangka parser + fixture + test untuk sumber yang fixture-nya tersedia di `tests/fixtures/`.
- **AC:** semua fixture yang tersedia ter-parse sesuai ekspektasi; notifikasi non-transaksi = `ignored`; confidence rendah = `needs_review`; reparse menghasilkan hasil yang sama tanpa duplikat.

### M3: API inti
- CRUD akun, transaksi, kategori, rules; saldo terhitung; rekonsiliasi; laporan; reparse endpoints.
- **AC:** semua endpoint di bagian 9 tersedia dan terdokumentasi di `/docs`; perhitungan saldo teruji dengan kasus income/expense/transfer/fee.

### M4: Android listener
- App sesuai bagian 12.
- **AC:** notifikasi dari app terpilih muncul di `raw_notifications` server dalam beberapa detik; saat HP offline lalu online, semua outbox terkirim tanpa duplikat; secret tidak ada di repo.

### M5: Web dashboard
- Halaman sesuai bagian 13 (urutan: Dashboard → Transaksi → Tambah cepat → Akun → Review → Kategori → Laporan).
- **AC:** semua halaman berfungsi di viewport 375px dan desktop; input cash selesai ≤ 3 langkah; lulus Lighthouse mobile ≥ 90 untuk Performance dan Accessibility pada halaman Dashboard.

### M6: Deploy & hardening
- Cloudflare Tunnel, Access policies, backup terjadwal, dokumentasi (`docs/DEPLOY.md`, `docs/RESTORE.md`, `docs/ADD_PARSER.md`).
- **AC:** aplikasi dapat diakses lewat domain; dashboard menolak akses tanpa login Access; ingest menolak tanpa service token; backup bisa direstore pada DB kosong (dibuktikan lewat skrip).

## 17. Aturan Kerja untuk Agent

1. Baca seluruh PRD sebelum menulis kode. Kerjakan satu milestone sekali.
2. Jangan menambah fitur atau dependensi besar di luar PRD tanpa alasan tertulis di `docs/DECISIONS.md`.
3. Setiap fitur backend wajib punya test. Jalankan test sebelum menyatakan milestone selesai.
4. **Dilarang mengarang format notifikasi bank.** Gunakan hanya fixture asli yang disediakan pengguna; jika tidak ada, buat kerangka dan tandai TODO.
5. Uang selalu integer rupiah. Waktu selalu timezone-aware.
6. Jangan menyimpan atau mencetak secret/kredensial; gunakan `.env.example` dengan placeholder.
7. Commit kecil dan bermakna per tugas. Perbarui `README.md` dengan cara menjalankan proyek.
8. Jika ada ambiguitas yang memengaruhi desain data, catat asumsi di `docs/DECISIONS.md` dan lanjutkan dengan opsi paling sederhana.

## 18. Hal yang Dibutuhkan dari Pengguna (input manual)

- Daftar bank dan e-wallet yang dipakai, beserta `package_name` Android-nya.
- **20–30 contoh teks notifikasi asli** per sumber (pemasukan, pengeluaran, transfer, promo) untuk fixture parser. Hapus data sensitif seperti nomor rekening lengkap.
- Domain Cloudflare dan token tunnel (disimpan di `.env`, bukan di repo).
- Spesifikasi server (VPS / mini PC) dan OS.

## 19. Pertanyaan Terbuka

- Apakah perlu ekspor data (CSV) pada fase awal?
- Apakah perlu budget per kategori (bisa menjadi fase 2)?
- Apakah dashboard perlu notifikasi (push/Telegram) saat saldo tidak cocok atau ada transaksi `needs_review`?

## 20. Fase 2 (di luar scope sekarang)

Budget & target tabungan, transaksi berulang, auto-kategori dengan ML/LLM, ekspor CSV, impor mutasi PDF/CSV, notifikasi Telegram, hutang-piutang.
