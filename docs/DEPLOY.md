# Deploy (Cloudflare Tunnel + Access)

Arsitektur produksi (PRD §5, §14):

```
HP Android ──HTTPS + service token──┐
Browser ──HTTPS + login Access──────┤
                                     ▼
                Cloudflare (Access, WAF, rate limit)
                                     │ Cloudflare Tunnel (koneksi keluar dari server)
                                     ▼
   server: cloudflared ─┬─ /api/*  → api:8000 (FastAPI) ─┐
                        └─ lainnya → web:3000 (Next.js) ──┴─ db:5432 (PostgreSQL, jaringan internal saja)
                                                             backup (pg_dump harian → volume backups)
```

Tidak ada port publik. Port `8000`/`3000` hanya di-bind ke `127.0.0.1` server; PostgreSQL tidak di-publish sama sekali.

## 0. Prasyarat

- Server Linux (VPS/mini PC) dengan Docker + Docker Compose v2, akses keluar ke internet.
- Domain yang DNS-nya dikelola Cloudflare (paket Free cukup) dan akun **Cloudflare Zero Trust** (Free, ≤50 pengguna).
- Firewall server boleh menolak semua koneksi masuk (tunnel adalah koneksi keluar). SSH sesuai kebutuhan.

Contoh di bawah memakai `finance.domainmu.com`; ganti dengan subdomain Anda.

## 1. Siapkan server

```bash
git clone <repo> finance && cd finance
cp .env.example .env
```

Isi `.env` untuk produksi:

| Variabel | Nilai |
|---|---|
| `ENV` | `prod` |
| `AUTH_DISABLED` | `false` |
| `POSTGRES_PASSWORD` | baru, acak: `openssl rand -hex 24` |
| `API_KEY` | baru, acak: `openssl rand -hex 32` (juga diisi di app Android) |
| `CF_ACCESS_TEAM_DOMAIN` | langkah 3 |
| `CF_ACCESS_AUD` | AUD aplikasi **Dashboard** (langkah 4) |
| `CF_ACCESS_INGEST_AUD` | AUD aplikasi **Ingest** (langkah 4) |
| `CLOUDFLARE_TUNNEL_TOKEN` | langkah 2 |

`.env` jangan pernah di-commit (sudah di `.gitignore`). API menolak start jika `AUTH_DISABLED=false` tetapi salah satu
`CF_ACCESS_*` kosong.

## 2. Buat Cloudflare Tunnel

Zero Trust dashboard → **Networks → Tunnels → Create a tunnel** → tipe **Cloudflared** → nama `finance`.
Pilih lingkungan "Docker", salin **token** dari perintah yang ditampilkan (bagian setelah `--token`) ke
`CLOUDFLARE_TUNNEL_TOKEN`. Jangan jalankan perintah docker dari halaman itu; compose sudah menyediakan service `cloudflared`.

Tambahkan **Public hostnames** (urutan penting, yang lebih spesifik di atas):

| # | Subdomain / domain | Path | Service |
|---|---|---|---|
| 1 | `finance` . `domainmu.com` | `^/api/` | `HTTP` `api:8000` |
| 2 | `finance` . `domainmu.com` | *(kosong)* | `HTTP` `web:3000` |

(`api` dan `web` adalah nama service di jaringan Docker internal; `cloudflared` berada di jaringan yang sama.)

### Varian: server sudah punya tunnel `cloudflared` di host (config lokal)

Jika `cloudflared` sudah berjalan sebagai service systemd dengan `/etc/cloudflared/config.yml` untuk layanan lain,
tidak perlu tunnel/token baru dan service `cloudflared` di compose **tidak dipakai** (`make up`, bukan `make up-prod`;
`CLOUDFLARE_TUNNEL_TOKEN` dibiarkan kosong). Port `API_PORT`/`WEB_PORT` di `.env` bisa diganti bila 8000/3000 terpakai
(tetap hanya di-bind ke `127.0.0.1`).

Tambahkan **sebelum** aturan catch-all `http_status:404` (urutan penting, path `/api/` dulu):

```yaml
  - hostname: finance.domainmu.com
    path: ^/api/
    service: http://127.0.0.1:18000   # API_PORT
  - hostname: finance.domainmu.com
    service: http://127.0.0.1:13000   # WEB_PORT
```

```bash
sudo cp /etc/cloudflared/config.yml /etc/cloudflared/config.yml.bak.$(date +%Y%m%d-%H%M%S)
sudo cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate
sudo systemctl restart cloudflared        # layanan lain di tunnel yang sama terputus beberapa detik
```

DNS: buat CNAME `finance` → `<TUNNEL_ID>.cfargotunnel.com` (Proxied) di dashboard Cloudflare, atau
`cloudflared tunnel route dns <TUNNEL_ID> finance.domainmu.com` jika `cert.pem` tersedia.

**Buat aplikasi Access (langkah 4) sebelum membuat DNS/route**, agar hostname tidak pernah terbuka tanpa login.

## 3. Team domain Access

Zero Trust → **Settings → Custom pages** (atau *Team name and domain*): catat `<tim>.cloudflareaccess.com` →
`CF_ACCESS_TEAM_DOMAIN=<tim>.cloudflareaccess.com`.

Aktifkan metode login di **Settings → Authentication → Login methods**: *One-time PIN* (email) sudah tersedia; Google opsional.

## 4. Aplikasi & policy Access

Buat **service token** dulu: **Access → Service auth → Service Tokens → Create** → nama `finance-android`,
durasi *Non-expiring* (atau 1 tahun dan catat tanggal perpanjangan). Salin **Client ID** dan **Client Secret**
(secret hanya ditampilkan sekali) → dipakai di app Android (tab Server).

Lalu **Access → Applications → Add an application → Self-hosted**, dua kali:

**A. Finance Ingest** (lebih spesifik, menang atas aplikasi B untuk path ini)
- Domain: `finance.domainmu.com`, path: `api/v1/ingest`
- Policy: nama `android`, **Action: Service Auth**, Include → *Service Token* → `finance-android`
- Tidak ada policy Allow untuk email → manusia tidak bisa membuka path ini.
- Setelah disimpan, buka tab Overview → salin **Application Audience (AUD) Tag** → `CF_ACCESS_INGEST_AUD`.

**B. Finance Dashboard**
- Domain: `finance.domainmu.com` (tanpa path)
- Policy: nama `pemilik`, **Action: Allow**, Include → *Emails* → email Anda
- Session duration: mis. 1 minggu.
- Salin **AUD Tag** → `CF_ACCESS_AUD`.

Backend memvalidasi header `Cf-Access-Jwt-Assertion` yang ditambahkan Cloudflare: dashboard harus JWT aplikasi B,
ingest harus JWT aplikasi A **dan** berasal dari service token, **plus** `X-API-Key` yang benar.

## 5. Rate limit ingest (WAF)

Cloudflare dashboard (domain) → **Security → WAF → Rate limiting rules → Create rule**:
- If incoming requests match: *URI Path* `starts with` `/api/v1/ingest`
- Same characteristics: IP; **60 requests per 1 minute**; Action: **Block** selama 1 menit.

(App Android mengirim batch ≤100 notifikasi per request, jadi batas ini longgar untuk pemakaian normal.)

## 6. Jalankan

```bash
make up-prod        # docker compose --profile tunnel up -d --build --wait
make migrate        # alembic upgrade head
docker compose logs cloudflared | tail   # harus ada "Registered tunnel connection"
```

Status tunnel di Zero Trust → Networks → Tunnels harus **Healthy**.

## 7. Verifikasi AC M6

Dari laptop/HP (bukan dari server), dengan secret diambil dari environment:

```bash
export CF_CLIENT_ID=... CF_CLIENT_SECRET=... API_KEY=...
ops/check-access.sh https://finance.domainmu.com
```

Semua baris harus `PASS`:
dashboard & API dashboard menolak tanpa login, service token tidak bisa membuka dashboard, ingest menolak tanpa
service token / dengan token salah / tanpa API key, dan menerima token + API key.

Lalu buka `https://finance.domainmu.com` di browser → halaman login Cloudflare Access → masuk dengan email Anda → dashboard.

## 8. Hubungkan HP

App Android tab **Server**:
- URL: `https://finance.domainmu.com`
- API key: nilai `API_KEY`
- CF-Access-Client-Id / Secret: dari langkah 4

Tab **Status** → semua centang hijau. Notifikasi baru muncul di halaman **Review → Gagal dibaca** / tabel raw
(`ignored` untuk app tanpa parser) dalam beberapa detik.

Build APK release (HTTPS saja) butuh signing config sendiri; APK debug juga bisa dipakai dengan URL HTTPS.

## 9. Backup

Service `backup` berjalan otomatis: `pg_dump` setiap hari 02:00 WIB ke volume `backups`, simpan 14 hari.
Cek: `make backups`. Backup manual: `make backup`. Bukti restore: `make restore-check`.
Salin volume backup ke lokasi lain secara berkala (mis. `docker run --rm -v finance_backups:/b -v $PWD:/out alpine tar czf /out/backups.tgz -C /b .`).
Prosedur restore: [RESTORE.md](RESTORE.md).

## 10. Update aplikasi

```bash
git pull
make up-prod
make migrate
```

## 11. Ukur ulang Lighthouse (sisa AC M5)

Setelah login Access di Chrome/Edge, buka DevTools → Lighthouse → Mobile → Performance + Accessibility → halaman `/`
(cookie sesi Access ikut terkirim). Atau via CLI dengan cookie `CF_Authorization` dari browser:

```bash
npx lighthouse https://finance.domainmu.com/ --only-categories=performance,accessibility \
  --extra-headers='{"Cookie":"CF_Authorization=<nilai cookie>"}'
```
