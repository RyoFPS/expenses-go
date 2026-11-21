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
