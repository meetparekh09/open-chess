from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, select

from app.chess_service import IllegalMoveError
from app.db import get_session
from app.goals import GoalError, evaluate_goal
from app.models import Attempt
from app.scenario_service import as_utc, attempt_out, get_scenario_or_404, scenario_goal
from app.schemas import AttemptIn, AttemptOut

router = APIRouter(prefix="/api/scenarios/{scenario_id}/attempts", tags=["attempts"])


@router.post("", response_model=AttemptOut, status_code=201)
def record_attempt(
    scenario_id: int, body: AttemptIn, session: Session = Depends(get_session)
) -> AttemptOut:
    """Store an attempt. The result comes from replaying the moves against the goal; an
    attempt whose goal is still undecided is recorded as abandoned."""
    scenario = get_scenario_or_404(session, scenario_id)
    try:
        status = evaluate_goal(scenario_goal(scenario), scenario.start_fen, body.moves)
    except (IllegalMoveError, GoalError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    started_at, ended_at = as_utc(body.started_at), as_utc(body.ended_at)
    if ended_at < started_at:
        raise HTTPException(status_code=422, detail="ended_at is before started_at.")
    result = "abandoned" if status.status == "in_progress" else status.status
    attempt = Attempt(
        scenario_id=scenario.id,
        started_at=started_at,
        ended_at=ended_at,
        moves=body.moves[: status.ply_count],
        result=result,
        ply_count=status.ply_count,
        moves_used=status.moves_used,
        duration_ms=int((ended_at - started_at).total_seconds() * 1000),
    )
    session.add(attempt)
    session.commit()
    session.refresh(attempt)
    return attempt_out(attempt)


@router.get("", response_model=list[AttemptOut])
def list_attempts(scenario_id: int, session: Session = Depends(get_session)) -> list[AttemptOut]:
    get_scenario_or_404(session, scenario_id)
    statement = (
        select(Attempt)
        .where(Attempt.scenario_id == scenario_id)
        .order_by(col(Attempt.started_at).desc())
    )
    return [attempt_out(a) for a in session.exec(statement)]
