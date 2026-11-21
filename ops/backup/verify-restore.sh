#!/bin/sh
# Bukti backup bisa direstore ke database KOSONG (AC M6):
#  1. ambil dump terbaru (atau argumen $1),
#  2. buat database baru yang kosong, restore dump ke sana,
#  3. bandingkan jumlah baris + checksum isi setiap tabel dengan database sumber,
#  4. hapus database uji. Exit code != 0 jika ada perbedaan.
set -eu
: "${PGHOST:=db}"
export PGHOST
dump="${1:-$(ls -1t /backups/finance-*.dump 2>/dev/null | head -n1)}"
[ -n "$dump" ] && [ -f "$dump" ] || { echo "tidak ada file backup di /backups" >&2; exit 1; }
check_db="${PGDATABASE}_restore_check"
tables="accounts categories category_rules raw_notifications transactions balance_snapshots alembic_version"

psql -qAt -d postgres -c "DROP DATABASE IF EXISTS \"$check_db\""
psql -qAt -d postgres -c "CREATE DATABASE \"$check_db\""
trap 'psql -qAt -d postgres -c "DROP DATABASE IF EXISTS \"$check_db\"" >/dev/null' EXIT

echo "dump        : $dump"
echo "db kosong   : $check_db ($(psql -qAt -d "$check_db" -c "select count(*) from pg_tables where schemaname='public'") tabel)"
sh /ops/restore.sh "$dump" "$check_db" > /dev/null

fingerprint() {
  psql -qAt -d "$1" -c "select count(*) || ' ' || coalesce(md5(string_agg(t::text, '|' order by t::text)), '-') from $2 t"
}

fail=0
printf '%-20s %-45s %s\n' tabel sumber hasil_restore
for t in $tables; do
  a=$(fingerprint "$PGDATABASE" "$t")
  b=$(fingerprint "$check_db" "$t")
  mark="OK"; [ "$a" = "$b" ] || { mark="BEDA"; fail=1; }
  printf '%-20s %-45s %s %s\n' "$t" "$a" "$b" "$mark"
done
# Catatan: dibandingkan dengan isi DB sumber SAAT INI; jika ada data baru setelah dump dibuat, hasilnya BEDA.
[ "$fail" -eq 0 ] && echo "VERIFIKASI RESTORE: LULUS" || { echo "VERIFIKASI RESTORE: GAGAL" >&2; exit 1; }
