.PHONY: up down logs build migrate test revision

up:
	docker compose up -d --build --wait

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
