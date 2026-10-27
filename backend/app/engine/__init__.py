"""Computer opponents.

- ``GoalSearchEngine``: alpha-beta search that scores positions against the scenario goal
  (e.g. the defender maximizes how long a target piece survives); works on any position,
  including kingless ones.
- ``StockfishEngine``: UCI Stockfish via ``chess.engine``; only usable for legal positions
  (exactly one king per side) and plays plain chess, ignoring the goal.

``auto`` uses Stockfish for checkmate and free goals when it is installed and the position is
legal, and goal search otherwise.
"""

from app.engine.base import Engine, EngineChoice, EngineUnavailableError
from app.engine.goal_search import GoalSearchEngine
from app.engine.stockfish import StockfishEngine
from app.goals import GoalState

__all__ = [
    "Engine",
    "EngineChoice",
    "EngineUnavailableError",
    "GoalSearchEngine",
    "StockfishEngine",
    "get_engine",
]


def get_engine(mode: str, state: GoalState) -> Engine | None:
    """Engine for an opponent ``mode``; ``None`` means the user moves both sides."""
    if mode == "manual":
        return None
    if mode == "goal_search":
        return GoalSearchEngine()
    stockfish = StockfishEngine()
    if mode == "stockfish":
        if not stockfish.available():
            raise EngineUnavailableError("Stockfish is not installed.")
        if not stockfish.supports(state):
            raise EngineUnavailableError(
                "Stockfish needs a legal position with exactly one king per side."
            )
        return stockfish
    if mode == "auto":
        if (
            state.goal.type in ("checkmate", "free")
            and stockfish.available()
            and stockfish.supports(state)
        ):
            return stockfish
        return GoalSearchEngine()
    raise EngineUnavailableError(f"Unknown opponent mode '{mode}'.")
