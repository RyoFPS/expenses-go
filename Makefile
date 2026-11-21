.PHONY: up up-prod down logs build migrate test revision backup backups restore-check web-test

up:
	docker compose up -d --build --wait

# Produksi: termasuk Cloudflare Tunnel (butuh CLOUDFLARE_TUNNEL_TOKEN di .env)
up-prod:
	docker compose --profile tunnel up -d --build --wait

down:
	docker compose down

logs:
	docker compose logs -f api

build:
	docker compose build api

migrate:
	docker compose run --rm api alembic upgrade head

# Test memakai DB terpisah <POSTGRES_DB>_test yang dibuat & dihapus otomatis.
test:
	docker compose run --rm api pytest -q

# Contoh: make revision m="add foo"
revision:
	docker compose run --rm -v "$(CURDIR)/backend:/app" api alembic revision --autogenerate -m "$(m)"

# Backup sekarang (di luar jadwal harian)
backup:
	docker compose exec backup sh -c 'set -a; . /etc/backup.env; set +a; sh /ops/backup.sh'

backups:
	docker compose exec backup ls -lh /backups

# Bukti restore: restore dump terbaru ke database kosong lalu bandingkan isi tiap tabel
restore-check:
	docker compose exec backup sh /ops/verify-restore.sh

web-test:
	cd web && npm test
