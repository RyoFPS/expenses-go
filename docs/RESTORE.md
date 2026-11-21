# Backup & restore

## Cara kerja backup

- Service `backup` (image `postgres:16-alpine`, versi sama dengan DB) menjalankan `ops/backup/backup.sh` via cron
  setiap hari **02:00 WIB** (`BACKUP_CRON`).
- Hasil: `/backups/finance-YYYYmmdd-HHMMSS.dump` (format custom `pg_dump`, terkompresi) di volume Docker terpisah
  `backups` (bukan volume database).
- Dump diverifikasi dapat dibaca (`pg_restore --list`) sebelum disimpan; file parsial tidak pernah tersisa sebagai `.dump`.
- Retensi **14 hari** (`BACKUP_RETENTION_DAYS`); dump lebih lama dihapus setelah backup berikutnya berhasil.

```bash
make backups        # daftar file backup
make backup         # backup sekarang
docker compose logs backup | tail    # log "backup OK" / "pruned"
```

## Bukti restore berkala

```bash
make restore-check
```

Skrip `ops/backup/verify-restore.sh` membuat database **baru yang kosong** (`<db>_restore_check`), me-restore dump
terbaru, lalu membandingkan **jumlah baris dan checksum isi** setiap tabel dengan database aktif, kemudian menghapus
database uji. Keluaran diakhiri `VERIFIKASI RESTORE: LULUS` (exit 0) atau `GAGAL` (exit 1).

Catatan: perbandingan dilakukan terhadap isi database **saat ini**. Jika ada transaksi baru setelah dump dibuat
(mis. notifikasi masuk), tabel itu akan tampil `BEDA`; jalankan `make backup` lalu `make restore-check` berurutan.
Restore ke database uji tidak menyentuh database aktif.

Contoh hasil (uji M6, 21 Nov 2026):

```
db kosong   : finance_restore_check (0 tabel)
accounts             2 8110…  2 8110… OK
transactions        28 b0f4…  28 b0f4… OK
...
VERIFIKASI RESTORE: LULUS
```

## Restore setelah bencana

Kehilangan/korupsi database. Semua perintah dari folder repo di server.

1. Hentikan penulis data agar tidak ada transaksi baru:
   ```bash
   docker compose stop api web cloudflared
   ```
2. Pilih dump:
   ```bash
   make backups
   ```
3. Kosongkan database (buat ulang):
   ```bash
   docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d postgres \
     -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE)" \
     -c "CREATE DATABASE \"$POSTGRES_DB\""'
   ```
4. Restore:
   ```bash
   docker compose exec backup sh /ops/restore.sh /backups/finance-YYYYmmdd-HHMMSS.dump
   ```
   (`--single-transaction --exit-on-error`: gagal di tengah = tidak ada perubahan setengah jadi.)
5. Pastikan skema terbaru lalu nyalakan lagi:
   ```bash
   make migrate          # no-op jika dump sudah di versi terbaru
   make up-prod
   ```
6. Cek: buka dashboard, saldo akun & transaksi terakhir sesuai; `docker compose run --rm api alembic current` = `(head)`.

Notifikasi yang masuk selama server mati tidak hilang: app Android menyimpannya di outbox dan mengirim ulang
otomatis; duplikat dicegah oleh `content_hash`.

### Pindah server / restore dari salinan di luar server

```bash
# di server lama (atau dari salinan)
docker run --rm -v finance_backups:/b -v "$PWD":/out alpine tar czf /out/backups.tgz -C /b .
# di server baru, setelah `make up-prod` pertama kali
docker run --rm -v finance_backups:/b -v "$PWD":/in alpine tar xzf /in/backups.tgz -C /b
```

Lalu ikuti langkah 1–6 di atas.

Teruji di M6 (stack uji terpisah): database dihapus total → dibuat ulang kosong → restore → API langsung melayani dengan
saldo dan transaksi yang sama, versi migrasi `head`.
