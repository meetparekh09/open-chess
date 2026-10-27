import pytest

from app.chess_service import IllegalMoveError
from app.goals import GoalError, evaluate_goal
from app.schemas import Goal, GoalParams

QUEEN_VS_KNIGHT = "8/8/8/3n4/8/8/8/Q7 w - - 0 1"


def capture_knight(max_moves=None, square=None):
    return Goal(
        type="capture",
        params=GoalParams(color="black", piece="n", square=square, max_moves=max_moves),
    )


def test_capture_in_progress_then_success():
    goal = capture_knight(max_moves=5)
    status = evaluate_goal(goal, QUEEN_VS_KNIGHT, ["a1a2"])
    assert status.status == "in_progress"
    assert status.moves_used == 1
    assert status.detail == "Moves used: 1 of 5."

    status = evaluate_goal(goal, QUEEN_VS_KNIGHT, ["a1a2", "d5c3", "a2c2", "c3e4", "c2e4"])
    assert status.status == "success"
    assert status.moves_used == 3
    assert status.ply_count == 5
    assert "3 moves" in status.detail


def test_capture_fails_when_out_of_moves():
    goal = capture_knight(max_moves=1)
    status = evaluate_goal(goal, QUEEN_VS_KNIGHT, ["a1a2"])
    assert status.status == "fail"


def test_capture_ignores_moves_after_goal_is_decided():
    goal = capture_knight(max_moves=1)
    status = evaluate_goal(goal, QUEEN_VS_KNIGHT, ["a1a2", "d5c3"])
    assert status.status == "fail"
    assert status.ply_count == 1


def test_tracks_specific_piece_by_square():
    fen = "8/8/8/3n4/8/8/8/Qn6 w - - 0 1"
    goal = capture_knight(square="d5")
    status = evaluate_goal(goal, fen, ["a1b1"])
    assert status.status == "in_progress"
    status = evaluate_goal(goal, fen, ["a1b1", "d5f4", "b1f5", "f4h3", "f5h3"])
    assert status.status == "success"


def test_count_based_target_needs_every_piece():
    fen = "8/8/8/3n4/8/8/8/Qn6 w - - 0 1"
    status = evaluate_goal(capture_knight(), fen, ["a1b1"])
    assert status.status == "in_progress"


def test_survive_goal():
    goal = Goal(type="survive", params=GoalParams(color="black", piece="n", max_moves=2))
    status = evaluate_goal(goal, QUEEN_VS_KNIGHT, ["a1a2", "d5f4"])
    assert status.status == "in_progress"
    status = evaluate_goal(goal, QUEEN_VS_KNIGHT, ["a1a2", "d5f4", "a2a3"])
    assert status.status == "success"
    assert status.detail == "The knight survived 2 moves."
    status = evaluate_goal(goal, QUEEN_VS_KNIGHT, ["a1a2", "d5c3", "a2c2", "c3e4", "c2e4"])
    assert status.status == "success"  # survived 2 attacker moves before the capture
    status = evaluate_goal(goal, QUEEN_VS_KNIGHT, ["a1d4", "d5c3", "d4c3"])
    assert status.status == "fail"


def test_survive_requires_move_count():
    goal = Goal(type="survive", params=GoalParams(color="black", piece="n"))
    with pytest.raises(GoalError):
        evaluate_goal(goal, QUEEN_VS_KNIGHT, [])


def test_checkmate_goal():
    fen = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1"
    goal = Goal(type="checkmate", params=GoalParams(color="white"))
    status = evaluate_goal(goal, fen, ["a1a8"])
    assert status.status == "success"
    assert status.detail == "Checkmate in 1 move."


def test_checkmate_requires_kings():
    goal = Goal(type="checkmate", params=GoalParams(color="white"))
    with pytest.raises(GoalError, match="king"):
        evaluate_goal(goal, QUEEN_VS_KNIGHT, [])


def test_promote_goal():
    fen = "8/1P6/8/8/8/8/8/8 w - - 0 1"
    goal = Goal(type="promote", params=GoalParams(color="white"))
    status = evaluate_goal(goal, fen, ["b7b8q"])
    assert status.status == "success"


def test_target_missing_is_an_error():
    goal = Goal(type="capture", params=GoalParams(color="black", piece="r"))
    with pytest.raises(GoalError, match="no black rook"):
        evaluate_goal(goal, QUEEN_VS_KNIGHT, [])


def test_free_goal_and_illegal_moves():
    goal = Goal()
    status = evaluate_goal(goal, QUEEN_VS_KNIGHT, ["a1a2"])
    assert status.status == "in_progress"
    with pytest.raises(IllegalMoveError, match="Move 1"):
        evaluate_goal(goal, QUEEN_VS_KNIGHT, ["d5c3"])
