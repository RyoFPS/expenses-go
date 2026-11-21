# Personal Finance Tracker

Pencatat keuangan pribadi self-hosted dengan auto-capture dari notifikasi Android. Spesifikasi lengkap: [PRD.md](PRD.md). Keputusan desain: [docs/DECISIONS.md](docs/DECISIONS.md).

Status: **M0** (fondasi) dan **M1** (ingest notifikasi mentah) selesai.

## Struktur

```
backend/    FastAPI (Python 3.12), SQLAlchemy async, Alembic, pytest
web/        Next.js dashboard (M5)
android/    Listener app Kotlin (M4)
docs/       Dokumentasi & keputusan
```

## Menjalankan (Docker)

Prasyarat: Docker + Docker Compose. `make` opsional (perintah setara tertulis di bawah).

```bash
cp .env.example .env          # lalu ganti POSTGRES_PASSWORD dan API_KEY
make up                       # docker compose up -d --build --wait
make migrate                  # docker compose run --rm api alembic upgrade head
curl http://127.0.0.1:8000/healthz   # {"status":"ok"}
```

Dokumentasi API interaktif: http://127.0.0.1:8000/docs

## Ingest notifikasi (M1)

```bash
curl -X POST http://127.0.0.1:8000/api/v1/ingest/notification \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"package_name":"com.example.bank","title":"...","text":"...","posted_at":1763700000123}'
```

- `202 {"status":"accepted","raw_id":"..."}`: baru disimpan.
- `200 {"status":"duplicate"}`: notifikasi yang sama sudah pernah diterima.
- `401`: API key salah/tidak ada. `422`: payload tidak valid.
- Batch (maks 100): `POST /api/v1/ingest/notification/batch` dengan body array.

## Test

```bash
make test                     # docker compose run --rm api pytest -q
```

Test membuat database `<POSTGRES_DB>_test` sendiri dan menghapusnya setelah selesai.

## Migrasi baru

```bash
make revision m="deskripsi perubahan"
```

Selalu periksa file hasil autogenerate (mis. tipe ENUM tidak otomatis di-drop di `downgrade`).

## Perintah lain

| Perintah | Fungsi |
|---|---|
| `make down` | Hentikan semua container (data DB tetap di volume `db_data`) |
| `make logs` | Ikuti log API |
