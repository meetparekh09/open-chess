"""Computer opponents (phase 2).

Scenarios currently only support ``opponent_mode = "manual"``. Planned implementations:

- ``StockfishEngine``: UCI Stockfish via ``chess.engine``; only usable for legal positions
  (exactly one king per side) and conventional goals such as checkmate.
- ``GoalSearchEngine``: alpha-beta search on python-chess that scores positions against
  the scenario goal (e.g. the defender maximizes how long a target piece survives), which
  also works for kingless positions.
"""

from typing import Protocol

import chess

from app.schemas import Goal


class Engine(Protocol):
    name: str

    def supports(self, board: chess.Board, goal: Goal) -> bool:
        """Whether this engine can play the given position toward the given goal."""
        ...

    def best_move(self, board: chess.Board, goal: Goal) -> chess.Move:
        """Pick a move for the side to move."""
        ...


def get_engine(opponent_mode: str) -> Engine | None:
    """Engine for a scenario's ``opponent_mode``; ``None`` means the user moves both sides."""
    if opponent_mode == "manual":
        return None
    raise NotImplementedError(f"Opponent mode '{opponent_mode}' is not available yet.")
