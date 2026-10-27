import chess
import pytest

from app.chess_service import parse_fen
from app.engine import StockfishEngine
from app.engine.stockfish import close_stockfish, stockfish_name, stockfish_path
from app.goals import GoalState
from app.schemas import Goal

pytestmark = pytest.mark.skipif(stockfish_path() is None, reason="Stockfish is not installed")


@pytest.fixture(autouse=True)
def shutdown():
    yield
    close_stockfish()


def test_reports_its_name():
    assert "Stockfish" in (stockfish_name() or "")


def test_finds_mate_in_one():
    goal = Goal(type="checkmate", params={"color": "white"})
    state = GoalState(goal, parse_fen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1"))
    choice = StockfishEngine().choose(state, 200)
    assert choice.move == chess.Move.from_uci("a1a8")
    assert choice.engine == "stockfish"
    assert "mate in 1" in choice.note
    assert state.board.fen() == "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1"


def test_does_not_support_kingless_positions():
    state = GoalState(Goal(), parse_fen("8/8/8/3n4/8/8/8/Q7 w - - 0 1"))
    assert not StockfishEngine().supports(state)
