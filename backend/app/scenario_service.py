from datetime import UTC, datetime

from fastapi import HTTPException
from sqlmodel import Session, col, select

from app.chess_service import IllegalMoveError, InvalidPositionError, parse_fen, replay
from app.goals import validate_goal
from app.models import Attempt, Scenario, SolutionStep
from app.schemas import (
    AttemptOut,
    AttemptStats,
    Goal,
    ScenarioDetail,
    ScenarioIn,
    ScenarioOut,
    SolutionStepIn,
    SolutionStepOut,
)

FEWEST_MOVES_GOALS = {"capture", "checkmate", "promote"}


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def normalize_scenario_input(data: ScenarioIn) -> ScenarioIn:
    """Validate the position and goal; returns the input with a normalized FEN and tags."""
    try:
        board = parse_fen(data.start_fen)
    except InvalidPositionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    errors = validate_goal(data.goal, board)
    if errors:
        raise HTTPException(status_code=422, detail=" ".join(errors))
    tags = []
    for tag in data.tags:
        tag = tag.strip().lower()
        if tag and tag not in tags:
            tags.append(tag)
    return data.model_copy(update={"start_fen": board.fen(), "tags": tags})


def apply_scenario_input(scenario: Scenario, data: ScenarioIn) -> None:
    scenario.title = data.title.strip()
    scenario.description = data.description
    scenario.notes = data.notes
    scenario.start_fen = data.start_fen
    scenario.player_side = data.player_side
    scenario.goal_type = data.goal.type
    scenario.goal_params = data.goal.params.model_dump(exclude_none=True)
    scenario.difficulty = data.difficulty
    scenario.tags = list(data.tags)
    scenario.source = data.source
    scenario.opponent_mode = data.opponent_mode


def scenario_goal(scenario: Scenario) -> Goal:
    return Goal.model_validate({"type": scenario.goal_type, "params": scenario.goal_params})


def get_scenario_or_404(session: Session, scenario_id: int) -> Scenario:
    scenario = session.get(Scenario, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found.")
    return scenario


def build_solution(start_fen: str, steps: list[SolutionStepIn]) -> list[SolutionStepOut]:
    try:
        outcomes = replay(start_fen, [step.move_uci for step in steps])
    except IllegalMoveError as exc:
        raise HTTPException(status_code=422, detail=f"Solution: {exc}") from exc
    return [
        SolutionStepOut(
            ply=ply,
            move_uci=outcome.uci,
            san=outcome.san,
            fen_after=outcome.board.fen(),
            comment=step.comment,
        )
        for ply, (step, outcome) in enumerate(zip(steps, outcomes, strict=True), start=1)
    ]


def load_solution(session: Session, scenario_id: int) -> list[SolutionStep]:
    statement = (
        select(SolutionStep)
        .where(SolutionStep.scenario_id == scenario_id)
        .order_by(col(SolutionStep.ply))
    )
    return list(session.exec(statement))


def replace_solution(session: Session, scenario: Scenario, steps: list[SolutionStepOut]) -> None:
    for row in load_solution(session, scenario.id):
        session.delete(row)
    for step in steps:
        session.add(SolutionStep(scenario_id=scenario.id, **step.model_dump()))


def attempt_out(attempt: Attempt) -> AttemptOut:
    return AttemptOut(
        id=attempt.id,
        scenario_id=attempt.scenario_id,
        started_at=as_utc(attempt.started_at),
        ended_at=as_utc(attempt.ended_at),
        moves=attempt.moves,
        result=attempt.result,
        ply_count=attempt.ply_count,
        moves_used=attempt.moves_used,
        duration_ms=attempt.duration_ms,
    )


def attempt_stats(goal_type: str, attempts: list[Attempt]) -> AttemptStats:
    successes = [a for a in attempts if a.result == "success"]
    best = None
    if goal_type in FEWEST_MOVES_GOALS and successes:
        best = min(successes, key=lambda a: (a.moves_used, a.duration_ms))
    elif goal_type == "survive":
        finished = [a for a in attempts if a.result != "abandoned"]
        if finished:
            best = max(finished, key=lambda a: (a.result == "success", a.moves_used))
    return AttemptStats(
        count=len(attempts),
        success_count=len(successes),
        best=attempt_out(best) if best else None,
    )


def attempts_by_scenario(session: Session, scenario_ids: list[int]) -> dict[int, list[Attempt]]:
    grouped: dict[int, list[Attempt]] = {sid: [] for sid in scenario_ids}
    if not scenario_ids:
        return grouped
    statement = select(Attempt).where(col(Attempt.scenario_id).in_(scenario_ids))
    for attempt in session.exec(statement):
        grouped[attempt.scenario_id].append(attempt)
    return grouped


def _scenario_fields(scenario: Scenario) -> dict:
    return {
        "id": scenario.id,
        "title": scenario.title,
        "description": scenario.description,
        "notes": scenario.notes,
        "start_fen": scenario.start_fen,
        "player_side": scenario.player_side,
        "goal": scenario_goal(scenario),
        "difficulty": scenario.difficulty,
        "tags": scenario.tags,
        "source": scenario.source,
        "opponent_mode": scenario.opponent_mode,
        "created_at": as_utc(scenario.created_at),
        "updated_at": as_utc(scenario.updated_at),
    }


def scenario_out(scenario: Scenario, attempts: list[Attempt]) -> ScenarioOut:
    return ScenarioOut(
        **_scenario_fields(scenario), stats=attempt_stats(scenario.goal_type, attempts)
    )


def scenario_detail(session: Session, scenario: Scenario) -> ScenarioDetail:
    attempts = attempts_by_scenario(session, [scenario.id])[scenario.id]
    solution = [
        SolutionStepOut(
            ply=row.ply,
            move_uci=row.move_uci,
            san=row.san,
            fen_after=row.fen_after,
            comment=row.comment,
        )
        for row in load_solution(session, scenario.id)
    ]
    return ScenarioDetail(
        **_scenario_fields(scenario),
        stats=attempt_stats(scenario.goal_type, attempts),
        solution=solution,
    )
