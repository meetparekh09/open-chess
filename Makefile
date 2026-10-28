.DEFAULT_GOAL := help
.PHONY: help setup doctor uv node stockfish install dev backend frontend test fmt lint build

UNAME_S := $(shell uname -s)
# The uv installer puts uv in ~/.local/bin; make it visible to later steps of the same run.
export PATH := $(HOME)/.local/bin:$(PATH)
# Vite and oxlint need Node ^20.19 or >=22.12.
NODE_OK := node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit((a===20&&b>=19)||(a===22&&b>=12)||a>22?0:1)"

help: ## Show this help
	@echo "Usage: make <target>"
	@echo
	@awk 'BEGIN {FS = ":.*## "} /^[a-z-]+:.*## / {printf "  %-10s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: uv node ## One-time setup: tools, Python and JS dependencies
	@$(MAKE) --no-print-directory install
	@echo
	@$(MAKE) --no-print-directory doctor
	@echo
	@echo "All set. Start the app with: make dev   (optional engine: make stockfish)"

doctor: ## Check required and optional tools
	@missing=0; \
	if command -v uv >/dev/null 2>&1; then echo "ok        $$(uv --version)"; \
	else echo "missing   uv                 -> make uv"; missing=1; fi; \
	if ! command -v node >/dev/null 2>&1; then echo "missing   node               -> make node"; missing=1; \
	elif $(NODE_OK); then echo "ok        node $$(node -v)"; \
	else echo "too old   node $$(node -v) (needs 20.19+ or 22.12+) -> make node"; missing=1; fi; \
	if command -v npm >/dev/null 2>&1; then echo "ok        npm $$(npm -v 2>/dev/null)"; \
	else echo "missing   npm                -> make node"; missing=1; fi; \
	if [ -n "$$OPEN_CHESS_STOCKFISH" ]; then echo "ok        stockfish (OPEN_CHESS_STOCKFISH=$$OPEN_CHESS_STOCKFISH)"; \
	elif command -v stockfish >/dev/null 2>&1 || [ -x /usr/games/stockfish ]; then echo "ok        stockfish"; \
	else echo "optional  stockfish          -> make stockfish (without it, opponents use goal search)"; fi; \
	if [ $$missing = 1 ]; then echo; echo "Install the missing tools, then run: make setup"; exit 1; fi

uv: ## Install uv (Python toolchain) if missing
	@if command -v uv >/dev/null 2>&1; then \
		echo "uv is already installed ($$(uv --version))"; \
	elif [ "$(UNAME_S)" = Darwin ] && command -v brew >/dev/null 2>&1; then \
		brew install uv; \
	else \
		curl -LsSf https://astral.sh/uv/install.sh | sh; \
		echo "Installed uv to ~/.local/bin; open a new shell (or add it to PATH) to use it directly."; \
	fi

node: ## Install Node.js if missing (Homebrew on macOS, instructions elsewhere)
	@if command -v node >/dev/null 2>&1 && $(NODE_OK); then \
		echo "Node.js $$(node -v) is already installed"; \
	elif [ "$(UNAME_S)" = Darwin ] && command -v brew >/dev/null 2>&1; then \
		if brew list node >/dev/null 2>&1; then brew upgrade node; else brew install node; fi; \
	else \
		echo "Please install Node.js 22 LTS (Vite needs 20.19+ or 22.12+). Distro packages are often too old."; \
		echo "  nvm:        https://github.com/nvm-sh/nvm   then: nvm install 22"; \
		echo "  NodeSource: https://github.com/nodesource/distributions"; \
		echo "  Official:   https://nodejs.org/en/download"; \
		exit 1; \
	fi

stockfish: ## Install Stockfish (optional engine) with your package manager
	@if [ -n "$$OPEN_CHESS_STOCKFISH" ]; then \
		echo "Using OPEN_CHESS_STOCKFISH=$$OPEN_CHESS_STOCKFISH"; \
	elif command -v stockfish >/dev/null 2>&1; then \
		echo "Stockfish is already installed: $$(command -v stockfish)"; \
	elif [ -x /usr/games/stockfish ]; then \
		echo "Stockfish is already installed: /usr/games/stockfish"; \
	elif [ "$(UNAME_S)" = Darwin ] && command -v brew >/dev/null 2>&1; then \
		brew install stockfish; \
	elif command -v apt-get >/dev/null 2>&1; then \
		sudo apt-get update && sudo apt-get install -y stockfish; \
	elif command -v dnf >/dev/null 2>&1; then \
		sudo dnf install -y stockfish; \
	elif command -v pacman >/dev/null 2>&1; then \
		sudo pacman -S --noconfirm stockfish; \
	elif command -v brew >/dev/null 2>&1; then \
		brew install stockfish; \
	else \
		echo "Could not find a supported package manager (brew, apt-get, dnf, pacman)."; \
		echo "Download Stockfish from https://stockfishchess.org/download/ and either put it on"; \
		echo "your PATH as 'stockfish' or set OPEN_CHESS_STOCKFISH=/path/to/stockfish."; \
		exit 1; \
	fi

install: ## Install Python and JS dependencies
	cd backend && uv sync
	cd frontend && npm install

# Runs the API on :8000 and the UI on :5173 (the UI proxies /api to the API).
dev: ## Run the API and the UI with live reload
	$(MAKE) -j2 backend frontend

backend: ## Run only the API (http://localhost:8000, docs at /docs)
	cd backend && uv run uvicorn app.main:app --reload --port 8000

frontend: ## Run only the UI (http://localhost:5173)
	cd frontend && npm run dev

test: ## Run backend tests (pytest) and frontend unit tests (vitest)
	cd backend && uv run pytest -q
	cd frontend && npm test

fmt: ## Format and auto-fix backend code
	cd backend && uv run ruff format . && uv run ruff check --fix .

lint: ## Lint backend and frontend
	cd backend && uv run ruff check .
	cd frontend && npm run lint

build: ## Type-check and build the frontend
	cd frontend && npm run build
