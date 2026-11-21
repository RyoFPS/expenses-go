#!/bin/sh
# Dump database ke /backups (format custom pg_dump) lalu hapus dump yang lebih tua dari RETENTION_DAYS.
set -eu
: "${PGHOST:=db}" "${PGUSER:?}" "${PGDATABASE:?}" "${RETENTION_DAYS:=14}"
export PGHOST

ts=$(date +%Y%m%d-%H%M%S)
tmp="/backups/.finance-$ts.dump.partial"
out="/backups/finance-$ts.dump"

pg_dump --format=custom --no-owner --no-privileges --file="$tmp"
pg_restore --list "$tmp" > /dev/null # gagal jika dump korup
mv "$tmp" "$out"
echo "$(date -Iseconds) backup OK: $out ($(du -h "$out" | cut -f1))"

# Retensi: simpan RETENTION_DAYS hari terakhir.
find /backups -maxdepth 1 -name 'finance-*.dump' -type f -mtime +"$((RETENTION_DAYS - 1))" -print -delete \
  | sed 's/^/pruned: /'
