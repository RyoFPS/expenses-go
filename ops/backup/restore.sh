#!/bin/sh
# Restore dump ke database target. PERINGATAN: objek yang ada di database target akan diganti.
# Pemakaian (di container backup): sh /ops/restore.sh /backups/finance-YYYYmmdd-HHMMSS.dump [nama_db]
set -eu
dump="${1:?pakai: restore.sh <file.dump> [database]}"
target="${2:-$PGDATABASE}"
[ -f "$dump" ] || { echo "file tidak ada: $dump" >&2; exit 1; }
echo "restore $dump -> database '$target'"
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --single-transaction \
  -h "${PGHOST:-db}" -d "$target" "$dump"
echo "restore selesai"
