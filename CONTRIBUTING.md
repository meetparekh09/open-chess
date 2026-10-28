# Contributing to Open Chess

Thanks for your interest! Bug reports, ideas and pull requests are all welcome.

## Getting set up

```bash
make setup       # uv, Node.js and all dependencies
make stockfish   # optional, needed to run the Stockfish tests and opponent
make dev         # API on :8000, UI on :5173, both with live reload
```

`make doctor` tells you what is missing. See the [README](README.md) for details.

## Before you open a pull request

```bash
make fmt     # format and auto-fix Python
make test    # backend (pytest) and frontend (vitest) tests
make lint    # ruff + oxlint
make build   # TypeScript type-check and production build
```

All four should pass. Tests that need Stockfish are skipped automatically when it is not
installed.

If you change behavior in the UI, please describe how you checked it (and add a screenshot if
it changes how something looks).

## Code style

- **Python**: formatted and linted with ruff (line length 100, 4-space indentation). Type
  hints on public functions. Tests go in `backend/tests/`, one file per module or feature.
- **TypeScript/React**: 2-space indentation, linted with oxlint (including the React Compiler
  rules). Keep API types in `frontend/src/api/types.ts` in sync with
  `backend/app/schemas.py`. Unit tests for pure helpers (`src/lib/`) live next to the code
  as `*.test.ts` and run with vitest.
- Keep comments for things the code cannot say on its own (constraints, non-obvious reasons).

## How the pieces fit together

- `backend/app/chess_service.py` wraps python-chess. Positions do not have to be legal: never
  gate on `board.is_valid()` outside the Stockfish engine.
- `backend/app/goals.py` is the single referee. `GoalState` replays moves and decides success
  or failure; the goals API, attempt recording and the engines all use it, so a goal rule
  only ever lives in one place.
- `backend/app/engine/` holds the computer opponents. `get_engine()` in `__init__.py` maps an
  opponent mode to an engine.

### Adding a goal type

1. Add the type to `GoalType` in `backend/app/schemas.py` (and `frontend/src/api/types.ts`).
2. Validate its parameters in `validate_goal` and decide it in `GoalState.status` in
   `backend/app/goals.py`.
3. Teach goal search how close a position is to the goal (`_Search.evaluate` in
   `backend/app/engine/goal_search.py`).
4. Add the label and defaults in the frontend (`GOAL_LABELS` in `src/lib/chess.ts`,
   `defaultGoal` in `src/lib/scenario.ts`).
5. Add tests in `backend/tests/test_goals.py` and `backend/tests/test_goal_search.py`.

### Adding an engine

1. Implement the `Engine` protocol from `backend/app/engine/base.py`: `supports(state)` and
   `choose(state, think_ms)`, which must leave the `GoalState` it is given unchanged.
2. Register it in `get_engine()` and add its mode to `OpponentMode` (backend and frontend)
   and to `OPPONENT_LABELS` in `frontend/src/lib/scenario.ts`.
3. Add tests. If it needs an external program, skip the tests when it is not installed (see
   `backend/tests/test_stockfish.py`) and add a `make` target to install it.

## Reporting bugs

Please include the FEN of the position, the goal, the moves you played and what you expected
to happen. *Copy* next to the FEN box and *Export* in the library make this easy.

## License

Open Chess is licensed under the [GPL-3.0-or-later](LICENSE). By contributing, you agree that
your contributions are licensed under the same terms.
