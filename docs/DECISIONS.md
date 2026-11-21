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
`package_name` boleh sama di beberapa akun, tetapi hanya **satu akun aktif** per package (lihat D-021).

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
Di M1 raw disimpan `pending`. Sejak M2 parser langsung dijalankan setelah simpan; raw `pending`
lama diproses lewat `reparse_all(pending)` (endpoint `POST /raw-notifications/reparse-all` di M3).

### D-014: Rate limit ingest diserahkan ke Cloudflare WAF
`slowapi` (opsional di PRD) tidak ditambahkan; rate limit dikonfigurasi di Cloudflare pada M6.

## M2

### D-015: Hanya parser myBCA; dataset contoh tidak dipakai sebagai fixture
Dataset contoh yang sempat diberikan (420 contoh, 7 sumber; sudah dihapus) adalah data sintetis
(package_name berselang-seling, judul gabungan seperti "DANA Kaget / Transfer Masuk", nama & tanggal seragam,
tanpa notifikasi non-transaksi). Sesuai PRD §17.4, parser tidak ditulis dari data itu.
Satu-satunya fixture asli: 5 notifikasi myBCA (`tests/fixtures/bca/`, ditranskripsi dari screenshot).
Sumber lain menunggu notifikasi asli (paling mudah dikumpulkan dari `raw_notifications` setelah M4);
raw dari package tanpa parser tersimpan sebagai `ignored` dan bisa di-reparse nanti.
`package_name` myBCA (`com.bca.mybca.omni.android`) sudah dikonfirmasi pengguna.

### D-016: `ParsedTransaction.category_hint`
Tambahan di luar interface PRD. myBCA menyertakan kategori ("Makanan", "Tagihan Rutin") tetapi tidak
menyertakan merchant pengeluaran, sehingga rule berbasis merchant tidak berguna untuk BCA.
Auto-kategori: (1) `category_rules` (priority tertinggi dulu, hanya kategori bertipe sama dengan transaksi;
regex tidak valid dilewati), lalu (2) `category_hint` dicocokkan ke nama kategori yang ada (case-insensitive).
Kategori tidak dibuat otomatis.

### D-017: Kolom `transactions.counter_raw_notification_id`
Saat transfer_matcher menggabungkan expense (bank) + income (e-wallet) menjadi satu transfer,
transaksi income dihapus dan raw-nya dicatat di kolom ini. Tanpa ini, reparse raw income akan
membuat transaksi income lagi (duplikat).

### D-018: Aturan pemrosesan raw
- Package tanpa parser / parser mengembalikan `None` → `ignored`.
- `ParseError` (judul dikenal tapi isi tidak cocok), error nominal, tidak ada akun aktif untuk package,
  atau lebih dari satu akun aktif untuk package → `failed` + `parse_error`. Error tak terduga juga `failed`
  dan dicatat (tanpa isi notifikasi). Tiap raw diproses dalam SAVEPOINT; satu raw gagal tidak memengaruhi lainnya.
- Akun ditentukan dari `accounts.package_name` (harus tepat satu akun aktif).
- `occurred_at` = waktu dari parser, atau `posted_at` jika tidak ada.
- Nominal dengan sen ≠ 0 dibulatkan half-up dan confidence diturunkan (→ `needs_review`).
- Transfer dari parser: `counterpart_hint` dicocokkan ke nama akun sendiri; jika tidak ketemu → `expense`.
- Snapshot saldo hanya dibuat saat transaksi baru tersimpan (bukan untuk duplikat dedup).

### D-019: Reparse tidak menimpa transaksi yang sudah ada
Raw yang sudah punya transaksi (langsung atau sebagai sisi lawan transfer) dilewati saat reparse dan tetap
`parsed`, agar koreksi manual pengguna (kategori, review) tidak hilang dan tidak ada duplikat.
Untuk mem-parse ulang transaksi yang salah, hapus transaksinya dulu lalu reparse raw-nya.

### D-020: Transfer matcher
Hanya transaksi `source=notification` yang belum berupa transfer. Kandidat: tipe berlawanan, nominal sama,
akun berbeda, |selisih waktu| ≤ 2 menit; dipilih yang paling dekat. Sisi expense menjadi transfer
(`account_id` sumber, `to_account_id` tujuan, kategori dikosongkan, `needs_review` = OR keduanya).
Top up dengan biaya admin (nominal beda) tidak digabung.

## M3

### D-021: Satu akun aktif per `package_name`
Partial unique index `uq_accounts_active_package_name` (`WHERE is_active AND package_name IS NOT NULL`).
Pipeline M2 butuh tepat satu akun per package; aturan ini mencegah konfigurasi ambigu sejak awal (409).

### D-022: Auth Cloudflare Access
- Endpoint selain `/healthz` dan `/api/v1/ingest/*` mewajibkan header `Cf-Access-Jwt-Assertion` yang valid:
  RS256, signature dari JWKS `https://<team>/cdn-cgi/access/certs` (di-cache 1 jam), `aud` = `CF_ACCESS_AUD`,
  `iss` = `https://<team>`, `exp` wajib. Gagal → `401 {"detail":"Unauthorized"}`.
- Jika `AUTH_DISABLED` tidak aktif, `CF_ACCESS_TEAM_DOMAIN` dan `CF_ACCESS_AUD` wajib diisi; API gagal start bila kosong.
- Dependensi baru: `pyjwt[crypto]` (verifikasi JWT/JWKS) dan `tzdata` (zona waktu Asia/Jakarta di image slim).

### D-023: Rekonsiliasi
- `GET /accounts/{id}/balance`: `calculated` = saldo saat ini; `diff` = `last_snapshot.balance` − saldo terhitung
  **per waktu snapshot** (`calculated_at_snapshot`). Dibandingkan dengan saldo saat ini, transaksi setelah
  snapshot akan selalu memunculkan selisih palsu.
- Endpoint tambahan `POST /accounts/{id}/reconcile` (tombol "Buat transaksi penyesuaian", PRD §11): membuat
  transaksi `source=manual` income/expense sebesar |diff| pada waktu snapshot, kategori "Penyesuaian saldo"
  (dibuat otomatis per tipe bila belum ada). 409 jika tidak ada snapshot/diff = 0.

### D-024: Aturan transaksi via API
- `fee` hanya untuk transfer; transfer wajib `to_account_id` ≠ `account_id`; transfer tidak berkategori;
  tipe kategori harus sama dengan tipe transaksi. Pelanggaran → 422 dengan pesan.
- `source` dan `needs_review` tidak bisa diisi client (pakai `mark-reviewed`). `occurred_at` wajib timezone-aware.
- PATCH memvalidasi state akhir. Mengubah tipe otomatis mengosongkan `to_account_id` (jika bukan transfer) dan
  kategori lama (jika tidak diisi eksplisit).
- Endpoint tambahan `GET /transactions/{id}` (detail + teks notifikasi mentah) untuk halaman detail PRD §13.
- Filter `account_id` mencakup transfer masuk (`to_account_id`). `q` mencari di merchant & catatan (wildcard di-escape).
- `GET /accounts` menyertakan `balance` terhitung agar dashboard tidak perlu N request.

### D-025: Laporan
- Batas hari/bulan dan pengelompokan memakai Asia/Jakarta; minggu dimulai Senin.
- Transfer antar akun sendiri tidak dihitung pemasukan/pengeluaran; **fee transfer dihitung pengeluaran**
  (`summary.fees` menampilkan porsinya). `by_category` hanya income/expense; tanpa kategori → "Tanpa kategori".
- Cashflow mengisi periode kosong dengan 0 (siap untuk chart); rentang maksimal 3×366 hari.
- `net-worth` menjumlah semua akun termasuk yang nonaktif (saldo tetap milik pengguna).

### D-026: Format error validasi
Error bisnis memakai `{"detail": "<pesan>"}`. Error validasi skema (422) memakai format bawaan FastAPI
(`detail` berupa list per field) agar lokasi field yang salah tetap jelas.

## M4

### D-027: Toolchain Android
AGP 9.1.0 (Kotlin bawaan AGP) + Gradle 9.3.1 + Kotlin 2.3.20 + KSP (Room). compileSdk/targetSdk 36 karena
AGP 9.1 maksimal 36. Compose BOM 2026.06.01 (Compose 1.11): Compose 1.12+ mewajibkan compileSdk 37.
Naik ke AGP yang mendukung API 37 bisa dilakukan nanti bersamaan dengan Compose terbaru.

### D-028: Stack Android disederhanakan
- HTTP memakai **OkHttp** saja (tanpa Retrofit; hanya 2 endpoint) dan `org.json` bawaan Android (tanpa plugin serialization).
- UI Jetpack Compose satu Activity dengan 4 tab (Status, Aplikasi, Server, Outbox).
- `androidx.security:security-crypto` (EncryptedSharedPreferences) sudah deprecated oleh Google, tetapi dipakai
  sesuai PRD §12.4. Kunci di Android Keystore. Bisa diganti DataStore + Tink di masa depan.

### D-029: Aturan penangkapan notifikasi
- Hanya package yang dipilih pengguna. Notifikasi **group summary** dan **ongoing** diabaikan (ringkasan dari
  notifikasi anak yang sudah ditangkap / progress & foreground service, bukan transaksi).
- `text` = terpanjang dari `EXTRA_TEXT` dan `EXTRA_BIG_TEXT`; teks kosong diabaikan; dipotong ke batas server
  (title 1.000, text 10.000) — praktis tidak pernah terjadi untuk notifikasi bank.
- Saat listener (re)connect, notifikasi yang masih tampil ikut dibaca agar yang terlewat saat proses mati tetap masuk.
  Duplikat dicegah unique index lokal (package, title, text, postedAt) + content_hash di server.
- Repost notifikasi yang sama (key sama, isi sama) dalam 10 menit dilewati: beberapa app memperbarui notifikasi dengan
  postTime baru, yang di server akan menjadi raw berbeda. Dua transaksi identik dari app yang memakai key berbeda
  per notifikasi tetap tertangkap.

### D-030: Outbox & sinkronisasi
- Room outbox: PENDING → SENT (accepted/duplicate) atau FAILED (401/403/redirect Access/4xx = perlu perbaikan konfigurasi).
- WorkManager: constraint jaringan, backoff eksponensial 30 detik, retry tanpa batas untuk error sementara
  (IO, 408, 429, 5xx, respons 2xx yang tidak dikenali). Dipicu setiap notifikasi baru, saat app start, saat pengaturan
  disimpan, dan periodik 15 menit sebagai jaring pengaman.
- Kirim via `/ingest/notification/batch` (maks 100). Batch 422 → dikirim satu per satu agar hanya item rusak yang FAILED.
- OkHttp tidak mengikuti redirect: Cloudflare Access me-redirect ke halaman login jika service token salah.
- Item SENT dihapus setelah 30 hari. `allowBackup=false` + data extraction rules: secret & isi notifikasi tidak ikut backup.

### D-031: Build debug untuk pengujian
Build debug (`applicationId` `.debug`) mengizinkan HTTP (server lokal) dan punya `DebugConfigReceiver` untuk
konfigurasi via adb pada uji otomatis di emulator. Build release hanya HTTPS dan tanpa receiver tersebut.
