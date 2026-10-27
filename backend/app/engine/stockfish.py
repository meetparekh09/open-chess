"""Stockfish over UCI.

One Stockfish process is shared by every request and guarded by a lock. It is started
lazily and closed when the app shuts down. The binary comes from ``OPEN_CHESS_STOCKFISH`` or
``stockfish`` on the ``PATH`` (or in ``/usr/games``).
"""

import os
import shutil
import threading

import chess
import chess.engine

from app.engine.base import EngineChoice, EngineUnavailableError
from app.goals import GoalState

_lock = threading.Lock()
_process: chess.engine.SimpleEngine | None = None


def stockfish_path() -> str | None:
    configured = os.environ.get("OPEN_CHESS_STOCKFISH")
    if configured:
        return configured if os.path.isfile(configured) else None
    # Debian/Ubuntu install it to /usr/games, which is not always on PATH.
    search_path = os.pathsep.join([os.environ.get("PATH", ""), "/usr/games"])
    return shutil.which("stockfish", path=search_path)


def _ensure_process() -> chess.engine.SimpleEngine:
    global _process
    if _process is None:
        path = stockfish_path()
        if path is None:
            raise EngineUnavailableError("Stockfish is not installed.")
        try:
            _process = chess.engine.SimpleEngine.popen_uci(path)
        except (OSError, chess.engine.EngineError) as exc:
            raise EngineUnavailableError(f"Could not start Stockfish: {exc}") from exc
    return _process


def _drop_process() -> None:
    global _process
    if _process is not None:
        try:
            _process.quit()
        except (chess.engine.EngineError, chess.engine.EngineTerminatedError, OSError):
            pass
        _process = None


def close_stockfish() -> None:
    with _lock:
        _drop_process()


def stockfish_name() -> str | None:
    """Stockfish's self-reported name, or ``None`` when it is unavailable."""
    with _lock:
        try:
            return _ensure_process().id.get("name")
        except EngineUnavailableError:
            return None


def _describe(score: chess.engine.Score) -> tuple[int | None, str]:
    mate = score.mate()
    if mate is not None:
        if mate > 0:
            return score.score(mate_score=100_000), f"Sees mate in {mate}."
        return score.score(mate_score=100_000), f"Sees itself getting mated in {-mate}."
    centipawns = score.score()
    return centipawns, f"Evaluation {centipawns / 100:+.2f}."


class StockfishEngine:
    name = "stockfish"

    def available(self) -> bool:
        return stockfish_path() is not None

    def supports(self, state: GoalState) -> bool:
        return state.board.is_valid()

    def choose(self, state: GoalState, think_ms: int) -> EngineChoice:
        board = state.board.copy()
        limit = chess.engine.Limit(time=think_ms / 1000)
        with _lock:
            try:
                result = _ensure_process().play(board, limit, info=chess.engine.INFO_SCORE)
            except chess.engine.EngineTerminatedError:
                _drop_process()
                result = _ensure_process().play(board, limit, info=chess.engine.INFO_SCORE)
        if result.move is None:
            raise EngineUnavailableError("Stockfish did not return a move.")
        score, note = None, "Stockfish move."
        if "score" in result.info:
            score, note = _describe(result.info["score"].pov(board.turn))
        return EngineChoice(
            move=result.move,
            engine=self.name,
            depth=result.info.get("depth"),
            score=score,
            note=note,
        )
