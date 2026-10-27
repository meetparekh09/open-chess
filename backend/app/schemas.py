from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Color = Literal["white", "black"]
GoalType = Literal["free", "capture", "survive", "checkmate", "promote"]
PieceLetter = Literal["p", "n", "b", "r", "q", "k"]
GoalStatusValue = Literal["in_progress", "success", "fail"]
AttemptResult = Literal["success", "fail", "abandoned"]
OpponentMode = Literal["manual"]


class GoalParams(BaseModel):
    """Shared goal parameters.

    - capture / survive: ``color`` and ``piece`` describe the target piece, ``square``
      optionally pins one specific piece, ``max_moves`` counts the attacker's moves
      (required for survive).
    - checkmate / promote: ``color`` is the side that has to achieve the goal.
    """

    color: Color | None = None
    piece: PieceLetter | None = None
    square: str | None = None
    max_moves: int | None = Field(default=None, ge=1)


class Goal(BaseModel):
    type: GoalType = "free"
    params: GoalParams = Field(default_factory=GoalParams)


class FenRequest(BaseModel):
    fen: str


class MoveRequest(BaseModel):
    fen: str
    move_uci: str


class MoveInfo(BaseModel):
    uci: str
    san: str
    from_square: str
    to_square: str
    promotion: str | None


class PositionInfo(BaseModel):
    fen: str
    turn: Color
    legal_moves: list[MoveInfo]
    warnings: list[str]
    is_check: bool
    is_checkmate: bool
    has_legal_moves: bool


class MoveResult(BaseModel):
    uci: str
    san: str
    captured: str | None
    position: PositionInfo


class GoalEvaluateRequest(BaseModel):
    moves: list[str] = Field(default_factory=list)
    start_fen: str | None = None
    goal: Goal | None = None
    scenario_id: int | None = None


class GoalStatus(BaseModel):
    status: GoalStatusValue
    detail: str
    moves_used: int
    ply_count: int


class SolutionStepIn(BaseModel):
    move_uci: str
    comment: str = ""


class SolutionStepOut(BaseModel):
    ply: int
    move_uci: str
    san: str
    fen_after: str
    comment: str


class SolutionUpdate(BaseModel):
    steps: list[SolutionStepIn]


class ScenarioIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    notes: str = ""
    start_fen: str
    player_side: Color = "white"
    goal: Goal = Field(default_factory=Goal)
    difficulty: int = Field(default=3, ge=1, le=5)
    tags: list[str] = Field(default_factory=list)
    source: str = ""
    opponent_mode: OpponentMode = "manual"


class AttemptIn(BaseModel):
    started_at: datetime
    ended_at: datetime
    moves: list[str]
    abandoned: bool = False


class AttemptOut(BaseModel):
    id: int
    scenario_id: int
    started_at: datetime
    ended_at: datetime
    moves: list[str]
    result: AttemptResult
    ply_count: int
    moves_used: int
    duration_ms: int


class AttemptStats(BaseModel):
    count: int
    success_count: int
    best: AttemptOut | None


class ScenarioOut(ScenarioIn):
    id: int
    created_at: datetime
    updated_at: datetime
    stats: AttemptStats


class ScenarioDetail(ScenarioOut):
    solution: list[SolutionStepOut]


class ScenarioExport(ScenarioIn):
    solution: list[SolutionStepIn] = Field(default_factory=list)


class ExportBundle(BaseModel):
    version: int = 1
    scenarios: list[ScenarioExport]


class ImportResult(BaseModel):
    imported: int
    ids: list[int]
