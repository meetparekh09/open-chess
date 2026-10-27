.PHONY: install dev backend frontend test fmt lint build

install:
	cd backend && uv sync
	cd frontend && npm install

# Runs the API on :8000 and the UI on :5173 (the UI proxies /api to the API).
dev:
	$(MAKE) -j2 backend frontend

backend:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test:
	cd backend && uv run pytest -q

fmt:
	cd backend && uv run ruff format . && uv run ruff check --fix .

lint:
	cd backend && uv run ruff check .
	cd frontend && npm run lint

build:
	cd frontend && npm run build
