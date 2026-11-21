# Keputusan & Asumsi

Catatan keputusan desain yang tidak tertulis eksplisit di PRD (lihat PRD §17 poin 2 & 8).

## M0

### D-001: Repo root = `finance-app/`
Folder repo ini berperan sebagai `finance-app/` di PRD §7; `backend/`, `web/`, `android/`, `docs/` langsung di root.

### D-002: Constraint tambahan di `transactions`
Untuk menjaga integritas uang di level DB:
- `amount > 0` (PRD: "selalu positif"), `fee >= 0`.
- `to_account_id` **wajib** jika `type = transfer` dan **harus NULL** untuk tipe lain.
  Transfer ke pihak luar (bukan akun milik sendiri) dicatat sebagai `expense`.
- `to_account_id != account_id`.
- FK ke `accounts` memakai `ON DELETE RESTRICT` (akun yang punya transaksi tidak bisa dihapus; nonaktifkan via `is_active`).
  FK ke `categories`/`raw_notifications` memakai `ON DELETE SET NULL`.

### D-003: `accounts.name` unik
Mencegah dua akun bernama sama (mis. dua "GoPay") yang membingungkan saat mapping parser.
`package_name` **tidak** unik, karena satu app bank bisa mewakili beberapa rekening.

### D-004: Enum PostgreSQL native
Semua enum di PRD §8 dibuat sebagai tipe ENUM PostgreSQL (menyimpan value, mis. `import`).
Menambah value nanti butuh migrasi `ALTER TYPE ... ADD VALUE`.

### D-005: Migrasi dijalankan eksplisit
API tidak menjalankan migrasi otomatis saat start; gunakan `make migrate`
(`alembic upgrade head`). Ini menghindari migrasi tak sengaja saat container restart.

### D-006: Dependensi test ikut di image API
Image `api` memasang dependency group `dev` (pytest, httpx, pytest-asyncio) supaya
`make test` berjalan di container yang sama dengan akses ke DB internal (DB tidak punya port publik).
Ukurannya kecil; bisa dipisah ke multi-stage build di M6 bila perlu.

### D-007: DB test terpisah
Test memakai database `<POSTGRES_DB>_test` yang dibuat ulang di awal sesi pytest dan dihapus di akhir,
sehingga data dev tidak tersentuh.

### D-008: Port API hanya di localhost
`api` di-publish ke `127.0.0.1:8000` untuk akses lokal/dev. Tidak ada port publik;
akses dari luar nanti lewat `cloudflared` (M6). PostgreSQL tidak di-publish sama sekali.

## M1

### D-009: `content_hash` memakai separator
`sha256(package_name ␟ title ␟ text ␟ posted_at_ms)` dengan separator ASCII `\x1f`.
Tanpa separator, `title="ab", text="c"` dan `title="a", text="bc"` menghasilkan hash yang sama.
`posted_at` di-hash sebagai integer epoch ms persis seperti dikirim Android.

### D-010: Idempotensi via `INSERT ... ON CONFLICT DO NOTHING`
Aman untuk kiriman paralel (mis. WorkManager retry bersamaan): hanya satu baris tersimpan,
request lain mendapat `duplicate`. Respons duplikat single = `200 {"status":"duplicate"}` sesuai PRD.

### D-011: Respons batch
`POST /ingest/notification/batch` selalu `200` dengan
`{"accepted": n, "duplicate": m, "results": [{"status", "raw_id"}...]}` berurutan sesuai request,
agar Android bisa menandai tiap item outbox. Batch 1–100 item; satu item tidak valid → seluruh batch `422`
(tidak ada yang disimpan). Item kembar di dalam satu batch: yang pertama `accepted`, sisanya `duplicate`.

### D-012: Validasi payload ingest
- Field tambahan ditolak (`extra=forbid`); tipe ketat (`posted_at` harus integer JSON, bukan string/float/bool).
- `posted_at` harus epoch **milidetik** ≥ tahun 2000 (menangkap salah satuan detik) dan ≤ sekarang + 1 hari.
- `package_name` 1–255 karakter `[A-Za-z0-9_.]`; `title` boleh kosong (≤1000); `text` 1–10.000 karakter.
- Teks tidak di-strip/dimodifikasi.

### D-013: Status raw setelah ingest = `pending`
Parser belum ada di M1, jadi raw disimpan `pending`. M2 akan menjalankan parser setelah simpan
dan memproses raw `pending` yang sudah ada.

### D-014: Rate limit ingest diserahkan ke Cloudflare WAF
`slowapi` (opsional di PRD) tidak ditambahkan; rate limit dikonfigurasi di Cloudflare pada M6.
