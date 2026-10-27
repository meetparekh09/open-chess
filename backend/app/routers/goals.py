from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.chess_service import IllegalMoveError, InvalidPositionError
from app.db import get_session
from app.goals import GoalError, evaluate_goal
from app.scenario_service import get_scenario_or_404, scenario_goal
from app.schemas import GoalEvaluateRequest, GoalStatus

router = APIRouter(prefix="/api/goals", tags=["goals"])


@router.post("/evaluate", response_model=GoalStatus)
def evaluate(body: GoalEvaluateRequest, session: Session = Depends(get_session)) -> GoalStatus:
    start_fen, goal = body.start_fen, body.goal
    if body.scenario_id is not None:
        scenario = get_scenario_or_404(session, body.scenario_id)
        start_fen = start_fen or scenario.start_fen
        goal = goal or scenario_goal(scenario)
    if start_fen is None or goal is None:
        raise HTTPException(status_code=422, detail="Provide a scenario_id or start_fen and goal.")
    try:
        result = evaluate_goal(goal, start_fen, body.moves)
    except (InvalidPositionError, IllegalMoveError, GoalError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return GoalStatus(**vars(result))
