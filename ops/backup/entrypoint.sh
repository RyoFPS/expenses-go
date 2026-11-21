#!/bin/sh
# Container backup: jalankan backup.sh setiap hari via crond (BACKUP_CRON, default 02:00 WIB).
set -eu
: "${BACKUP_CRON:=0 2 * * *}"
mkdir -p /backups
printf 'PGUSER=%s\nPGDATABASE=%s\nPGPASSWORD=%s\nRETENTION_DAYS=%s\n' \
  "$PGUSER" "$PGDATABASE" "$PGPASSWORD" "${RETENTION_DAYS:-14}" > /etc/backup.env
chmod 600 /etc/backup.env
echo "$BACKUP_CRON set -a; . /etc/backup.env; set +a; sh /ops/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
echo "backup terjadwal: '$BACKUP_CRON' (TZ=$TZ), retensi ${RETENTION_DAYS:-14} hari"
exec crond -f -l 8
