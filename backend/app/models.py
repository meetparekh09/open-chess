from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC)


class Scenario(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str
    description: str = ""
    notes: str = ""
    start_fen: str
    player_side: str = "white"
    goal_type: str = "free"
    goal_params: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False)
    )
    difficulty: int = 3
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    source: str = ""
    opponent_mode: str = "manual"
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class SolutionStep(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    scenario_id: int = Field(foreign_key="scenario.id", index=True)
    ply: int
    move_uci: str
    san: str
    fen_after: str
    comment: str = ""


class Attempt(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    scenario_id: int = Field(foreign_key="scenario.id", index=True)
    started_at: datetime
    ended_at: datetime
    moves: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    result: str
    ply_count: int
    moves_used: int
    duration_ms: int
