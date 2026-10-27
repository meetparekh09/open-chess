import pytest

from app.chess_service import parse_fen
from app.engine import EngineUnavailableError, GoalSearchEngine, StockfishEngine, get_engine
from app.goals import GoalState
from app.schemas import Goal

KINGLESS = "8/8/8/3n4/8/8/8/Q7 w - - 0 1"
ROOK_MATE = "8/8/8/4k3/8/8/8/R3K3 w - - 0 1"


def state(fen: str, goal: Goal | None = None) -> GoalState:
    return GoalState(goal or Goal(), parse_fen(fen))


def test_manual_mode_has_no_engine():
    assert get_engine("manual", state(KINGLESS)) is None


def test_goal_search_mode():
    assert isinstance(get_engine("goal_search", state(ROOK_MATE)), GoalSearchEngine)


def test_auto_uses_goal_search_for_kingless_positions():
    assert isinstance(get_engine("auto", state(KINGLESS)), GoalSearchEngine)


def test_auto_uses_goal_search_for_capture_goals():
    goal = Goal(type="capture", params={"color": "black", "piece": "k"})
    assert isinstance(get_engine("auto", state(ROOK_MATE, goal)), GoalSearchEngine)


def test_stockfish_rejects_kingless_positions(monkeypatch):
    monkeypatch.setattr(StockfishEngine, "available", lambda self: True)
    with pytest.raises(EngineUnavailableError, match="one king per side"):
        get_engine("stockfish", state(KINGLESS))


def test_stockfish_missing(monkeypatch):
    monkeypatch.setattr(StockfishEngine, "available", lambda self: False)
    with pytest.raises(EngineUnavailableError, match="not installed"):
        get_engine("stockfish", state(ROOK_MATE))
    assert isinstance(get_engine("auto", state(ROOK_MATE)), GoalSearchEngine)


def test_auto_prefers_stockfish_for_legal_checkmate_goals(monkeypatch):
    monkeypatch.setattr(StockfishEngine, "available", lambda self: True)
    goal = Goal(type="checkmate", params={"color": "white"})
    assert isinstance(get_engine("auto", state(ROOK_MATE, goal)), StockfishEngine)
