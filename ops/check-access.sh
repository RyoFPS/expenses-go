#!/usr/bin/env bash
# Verifikasi AC M6 dari internet setelah deploy (jalankan dari mesin mana pun, bukan dari server):
#   - dashboard & API dashboard menolak tanpa login Cloudflare Access
#   - ingest menolak tanpa service token, dan menolak service token tanpa API key
#   - ingest menerima service token + API key
#   - service token tidak bisa dipakai membuka dashboard
#
# Pemakaian:
#   CF_CLIENT_ID=xxx.access CF_CLIENT_SECRET=yyy API_KEY=zzz ops/check-access.sh https://finance.domainmu.com
# Secret dibaca dari environment (jangan ditulis di command line yang tersimpan di history bersama).
set -uo pipefail

BASE="${1:?pakai: check-access.sh https://finance.domainmu.com}"
BASE="${BASE%/}"
: "${CF_CLIENT_ID:?set CF_CLIENT_ID}" "${CF_CLIENT_SECRET:?set CF_CLIENT_SECRET}" "${API_KEY:?set API_KEY}"

pass=0
fail=0
check() { # check <nama> <harapan: regex kode HTTP> <kode aktual>
  if [[ "$3" =~ ^($2)$ ]]; then
    printf '  PASS  %-62s (HTTP %s)\n' "$1" "$3"
    pass=$((pass + 1))
  else
    printf '  FAIL  %-62s (HTTP %s, harapan %s)\n' "$1" "$3" "$2"
    fail=$((fail + 1))
  fi
}
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$@"; }

now_ms=$(($(date +%s) * 1000))
probe=$(printf '{"package_name":"check.access.probe","title":"cek akses","text":"probe %s","posted_at":%s}' "$now_ms" "$now_ms")
sa=(-H "CF-Access-Client-Id: $CF_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_CLIENT_SECRET")
json=(-H "Content-Type: application/json")

echo "Target: $BASE"
echo "Dashboard (harus minta login Access):"
check "GET / tanpa login -> redirect/tolak" "302|303|401|403" "$(code "$BASE/")"
check "GET /api/v1/accounts tanpa login -> redirect/tolak" "302|303|401|403" "$(code "$BASE/api/v1/accounts")"
check "GET /api/v1/accounts dengan service token -> tolak" "302|303|401|403" "$(code "${sa[@]}" "$BASE/api/v1/accounts")"

echo "Ingest (harus service token + API key):"
check "POST ingest tanpa service token -> tolak" "302|303|401|403" \
  "$(code -X POST "${json[@]}" -H "X-API-Key: $API_KEY" -d "$probe" "$BASE/api/v1/ingest/notification")"
check "POST ingest dengan service token salah -> tolak" "302|303|401|403" \
  "$(code -X POST "${json[@]}" -H "CF-Access-Client-Id: salah.access" -H "CF-Access-Client-Secret: salah" -H "X-API-Key: $API_KEY" -d "$probe" "$BASE/api/v1/ingest/notification")"
check "POST ingest service token tanpa API key -> 401" "401" \
  "$(code -X POST "${json[@]}" "${sa[@]}" -d "$probe" "$BASE/api/v1/ingest/notification")"
check "POST ingest service token + API key -> diterima" "200|202" \
  "$(code -X POST "${json[@]}" "${sa[@]}" -H "X-API-Key: $API_KEY" -d "$probe" "$BASE/api/v1/ingest/notification")"

echo
echo "Hasil: $pass lulus, $fail gagal"
echo "(Notifikasi uji tersimpan sebagai raw 'ignored' dengan package check.access.probe; aman diabaikan.)"
[ "$fail" -eq 0 ]
