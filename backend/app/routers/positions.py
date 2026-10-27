from fastapi import APIRouter, HTTPException

from app.chess_service import (
    IllegalMoveError,
    InvalidPositionError,
    apply_move,
    describe_position,
    parse_fen,
)
from app.schemas import FenRequest, MoveRequest, MoveResult, PositionInfo

router = APIRouter(prefix="/api/positions", tags=["positions"])


@router.post("/validate", response_model=PositionInfo)
def validate_position(body: FenRequest) -> dict:
    try:
        board = parse_fen(body.fen)
    except InvalidPositionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return describe_position(board)


@router.post("/move", response_model=MoveResult)
def make_move(body: MoveRequest) -> dict:
    try:
        board = parse_fen(body.fen)
        outcome = apply_move(board, body.move_uci)
    except (InvalidPositionError, IllegalMoveError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "uci": outcome.uci,
        "san": outcome.san,
        "captured": outcome.captured.symbol() if outcome.captured else None,
        "position": describe_position(outcome.board),
    }
