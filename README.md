# Open Chess

A personal chess practice board for drilling *any* position, legal or not. Set up a queen
against a lone knight with no kings on the board and practice how quickly you can trap it,
or flip it around and see how long the knight can survive.

- **Any position.** Build a position with the drag-and-drop editor or paste a FEN. Kings are
  optional; check and checkmate simply do not apply to a side without a king.
- **Goals.** Each scenario has a goal and the app keeps score: capture a piece (optionally
  within N moves), keep a piece alive for N moves, checkmate, promote a pawn, or free practice.
- **Scenario library.** Save scenarios with a title, description, notes, tags, difficulty and
  source; search, filter, export and import them as JSON.
- **Solutions.** Record the step-by-step solution with a comment per move, then use it as a
  hint while practicing.
- **Attempts.** Every finished attempt is saved with its result, number of moves and time,
  so you can track your best.
- **Computer opponents.** Play against a goal-aware search engine (works on any position) or
  Stockfish (legal positions), or move both sides yourself.

## Quick start

You need `make`, `git` and either macOS or Linux (on Windows, use
[WSL](https://learn.microsoft.com/windows/wsl/install)).

```bash
git clone https://github.com/meetparekh09/open-chess.git
cd open-chess
make setup       # installs uv and Node.js if needed, then all dependencies
make stockfish   # optional: the Stockfish opponent
make dev         # API on :8000, UI on :5173
```

Open <http://localhost:5173>.

`make setup` can be run again at any time. Run `make doctor` to see what is installed and what
is missing:

```text
ok        uv 0.8.22
ok        node v22.12.0
ok        npm 10.9.0
optional  stockfish          -> make stockfish (without it, opponents use goal search)
```

### Prerequisites

| Tool | Needed for | How `make` installs it |
| --- | --- | --- |
| [uv](https://docs.astral.sh/uv/) | Python 3.11 and backend dependencies | `make uv`: Homebrew on macOS, the official installer elsewhere |
| [Node.js](https://nodejs.org/) 20.19+ or 22.12+ | Frontend | `make node`: Homebrew on macOS; prints install options on Linux |
| [Stockfish](https://stockfishchess.org/) (optional) | Stockfish opponent | `make stockfish`: Homebrew, apt, dnf or pacman |

uv downloads the right Python version by itself, so you do not need Python installed.

## Using it

1. **New scenario**: place pieces (drag from the palette, click to place, right-click to
   remove), choose the side to move, then fill in the title, goal and opponent.
2. **Practice**: play the position. The goal panel tracks moves used, time and the result.
   *Hint* shows the next move of the recorded solution.
3. **Solution**: record the intended line and comment on each move.
4. **Free board**: an unsaved board for quick analysis (`/practice?fen=...`).

### Opponents

Each scenario stores a default opponent; the Practice page can override it, and lets you pick
the think time (0.2s to 3s).

| Opponent | What it does |
| --- | --- |
| Manual | You move both sides. |
| Goal search | An alpha-beta search that plays for the scenario goal: the attacker tries to reach it as fast as possible, the defender delays it as long as possible. Works on any position, including ones without kings. |
| Stockfish | Plays regular chess at full strength. Needs Stockfish installed and a legal position with exactly one king per side. |
| Auto | Stockfish for checkmate and free-practice goals when it is installed and the position is legal; goal search otherwise. |

The computer always plays the side you are not playing, and moves first if it is its turn.

## Configuration

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `OPEN_CHESS_DATABASE_URL` | `sqlite:///backend/data/open_chess.db` | Where scenarios and attempts are stored. |
| `OPEN_CHESS_STOCKFISH` | `stockfish` on your `PATH` (or `/usr/games/stockfish`) | Path to a Stockfish binary. |

Your data lives in `backend/data/` (ignored by git). Use *Export* in the library to back up
scenarios as JSON.

## Development

| Command | What it does |
| --- | --- |
| `make dev` | API and UI with live reload |
| `make backend` / `make frontend` | Run one side only |
| `make test` | Backend tests (pytest) |
| `make lint` | ruff (backend) and oxlint (frontend) |
| `make fmt` | Format and auto-fix backend code |
| `make build` | Type-check and build the frontend |
| `make help` | List all targets |

Interactive API docs are at <http://localhost:8000/docs> while the backend runs.

### Project layout

```text
backend/                FastAPI + SQLModel (SQLite), managed with uv
  app/chess_service.py  Position parsing and move handling (python-chess)
  app/goals.py          Goal rules: the referee used by the API and the engines
  app/engine/           Computer opponents (goal search, Stockfish)
  app/routers/          REST endpoints under /api
  tests/                pytest suite
frontend/               React + TypeScript + Vite
  src/pages/            Library, editor, practice, solution recorder
  src/components/       Board, palette, goal panel, move list, ...
  src/api/              Typed API client
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute.

## Ideas

Feature ideas live on the [Open Chess Ideas board](https://claude.ai/artifact/BBJ8rcPj1VXkdPczBEGnj1).
Like the ones you want built; collaborators approve or reject them there before work starts.

## License

Open Chess is free software, licensed under the [GNU General Public License v3.0 or later](LICENSE).

It builds on [python-chess](https://github.com/niklasf/python-chess) (GPL-3.0) for move
generation and can use [Stockfish](https://stockfishchess.org/) (GPL-3.0), which runs as a
separate program and is not bundled. The board UI uses
[react-chessboard](https://github.com/Clariity/react-chessboard).
