# Personal Finance Tracker

Pencatat keuangan pribadi self-hosted dengan auto-capture dari notifikasi Android. Spesifikasi lengkap: [PRD.md](PRD.md). Keputusan desain: [docs/DECISIONS.md](docs/DECISIONS.md).

Status: **M0 (fondasi)** selesai: backend FastAPI + PostgreSQL + Alembic + `/healthz`.

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
