from dataclasses import dataclass
from typing import Protocol

import chess

from app.goals import GoalState


class EngineUnavailableError(RuntimeError):
    pass


@dataclass
class EngineChoice:
    move: chess.Move
    engine: str
    depth: int | None
    # From the engine's point of view: positive is good for the side the engine plays.
    score: int | None
    note: str


class Engine(Protocol):
    name: str

    def supports(self, state: GoalState) -> bool:
        """Whether this engine can play the current position of ``state``."""
        ...

    def choose(self, state: GoalState, think_ms: int) -> EngineChoice:
        """Pick a move for the side to move; ``state`` must be left as it was given."""
        ...
