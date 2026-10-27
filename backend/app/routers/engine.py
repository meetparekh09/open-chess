from fastapi import APIRouter, HTTPException

from app.chess_service import IllegalMoveError, InvalidPositionError, apply_move, describe_position
from app.engine import EngineUnavailableError, get_engine
from app.engine.stockfish import stockfish_name, stockfish_path
from app.goals import GoalError, goal_state
from app.schemas import EngineMoveRequest, EngineMoveResponse, EngineStatus

router = APIRouter(prefix="/api/engine", tags=["engine"])


@router.post("/move", response_model=EngineMoveResponse)
def engine_move(body: EngineMoveRequest) -> EngineMoveResponse:
    try:
        state = goal_state(body.goal, body.start_fen, body.moves)
    except (InvalidPositionError, IllegalMoveError, GoalError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    decided = state.status()
    if decided is not None:
        raise HTTPException(status_code=409, detail=f"The attempt is over: {decided.detail}")
    if not any(state.board.legal_moves):
        raise HTTPException(status_code=409, detail="There are no legal moves to play.")
    try:
        engine = get_engine(body.mode, state)
        if engine is None:
            raise HTTPException(status_code=422, detail="Manual mode has no computer opponent.")
        choice = engine.choose(state, body.think_ms)
    except EngineUnavailableError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    outcome = apply_move(state.board, choice.move.uci())
    return EngineMoveResponse(
        uci=outcome.uci,
        san=outcome.san,
        captured=outcome.captured.symbol() if outcome.captured else None,
        position=describe_position(outcome.board),
        engine=choice.engine,
        depth=choice.depth,
        score=choice.score,
        note=choice.note,
    )


@router.get("/status", response_model=EngineStatus)
def engine_status() -> EngineStatus:
    return EngineStatus(
        stockfish_available=stockfish_path() is not None,
        stockfish_name=stockfish_name(),
        stockfish_path=stockfish_path(),
    )
