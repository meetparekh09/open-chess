import chess

from app.chess_service import parse_fen
from app.engine import GoalSearchEngine
from app.engine.goal_search import WIN_THRESHOLD
from app.goals import GoalState
from app.schemas import Goal


def choose(fen: str, goal: Goal, think_ms: int = 500):
    state = GoalState(goal, parse_fen(fen))

    def snapshot():
        tracker = state.tracker.snapshot() if state.tracker else None
        return state.board.fen(), state.ply, state.actor_moves, tracker

    before = snapshot()
    choice = GoalSearchEngine().choose(state, think_ms)
    assert snapshot() == before, "search must leave the state untouched"
    assert choice.move in state.board.legal_moves
    return choice


def capture_knight(max_moves: int | None = None) -> Goal:
    return Goal(type="capture", params={"color": "black", "piece": "n", "max_moves": max_moves})


def test_takes_a_hanging_target():
    choice = choose("8/8/8/3n4/8/8/8/3Q4 w - - 0 1", capture_knight())
    assert choice.move == chess.Move.from_uci("d1d5")
    assert choice.score >= WIN_THRESHOLD


def test_prefers_target_over_other_material():
    # The queen can take a rook on a4 or the target knight on d4.
    choice = choose("8/8/8/8/r2n4/8/8/Q7 w - - 0 1", capture_knight())
    assert choice.move == chess.Move.from_uci("a1d4")


def test_queen_finds_forced_knight_capture():
    choice = choose("8/8/8/3n4/8/8/8/Q7 w - - 0 1", capture_knight(10), think_ms=1500)
    assert choice.score >= WIN_THRESHOLD
    assert "forced win" in choice.note


def test_knight_runs_from_attack():
    # Black to move; the knight on d5 is attacked by the queen on d1.
    choice = choose("8/8/8/3n4/8/8/8/3Q4 b - - 0 1", capture_knight(10))
    assert choice.move.from_square == chess.D5
    board = parse_fen("8/8/8/3n4/8/8/8/3Q4 b - - 0 1")
    board.push(choice.move)
    assert not board.is_attacked_by(chess.WHITE, choice.move.to_square)


def test_defender_delays_the_capture_in_survive_goal():
    goal = Goal(type="survive", params={"color": "black", "piece": "n", "max_moves": 3})
    choice = choose("8/8/8/3n4/8/8/8/3Q4 b - - 0 1", goal)
    board = parse_fen("8/8/8/3n4/8/8/8/3Q4 b - - 0 1")
    board.push(choice.move)
    assert not board.is_attacked_by(chess.WHITE, choice.move.to_square)


def test_finds_mate_in_one():
    goal = Goal(type="checkmate", params={"color": "white"})
    choice = choose("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", goal)
    assert choice.move == chess.Move.from_uci("a1a8")


def test_promotes_when_possible():
    goal = Goal(type="promote", params={"color": "white"})
    choice = choose("8/4P3/8/8/8/8/8/k6K w - - 0 1", goal)
    assert choice.move.promotion is not None


def test_single_legal_move_is_returned_immediately():
    # The rook on a7 covers the seventh rank, so the black king's only move is to g8.
    choice = choose("7k/R7/8/8/8/8/8/6K1 b - - 0 1", Goal())
    assert choice.move == chess.Move.from_uci("h8g8")
