import pytest

from app.chess_service import IllegalMoveError
from app.goals import GoalError, evaluate_goal
from app.schemas import Goal, GoalParams

QUEEN_VS_KNIGHT = "8/8/8/3n4/8/8/8/Q7 w - - 0 1"
QUEEN_VS_TWO_KNIGHTS = "8/8/8/3n4/8/8/8/Qn6 w - - 0 1"
BACK_RANK_MATE = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1"


def capture_knight(max_moves=None, square=None):
    return Goal(
        type="capture",
        params=GoalParams(color="black", piece="n", square=square, max_moves=max_moves),
    )


def survive_knight(max_moves=None, square=None):
    return Goal(
        type="survive",
        params=GoalParams(color="black", piece="n", square=square, max_moves=max_moves),
    )


def white_goal(goal_type, max_moves=None):
    """A checkmate or promote goal for white."""
    return Goal(type=goal_type, params=GoalParams(color="white", max_moves=max_moves))


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
    goal = capture_knight(square="d5")
    status = evaluate_goal(goal, QUEEN_VS_TWO_KNIGHTS, ["a1b1"])
    assert status.status == "in_progress"
    status = evaluate_goal(goal, QUEEN_VS_TWO_KNIGHTS, ["a1b1", "d5f4", "b1f5", "f4h3", "f5h3"])
    assert status.status == "success"


def test_count_based_target_needs_every_piece():
    status = evaluate_goal(capture_knight(), QUEEN_VS_TWO_KNIGHTS, ["a1b1"])
    assert status.status == "in_progress"


def test_follows_the_target_through_castling():
    # Black castles queenside, so the rook that started on a8 is on d8 when it is taken.
    fen = "r3k3/8/8/8/8/8/8/7R w q - 0 1"
    goal = Goal(type="capture", params=GoalParams(color="black", piece="r", square="a8"))
    line = ["h1h2", "e8c8", "h2h8", "c8b8", "h8d8"]
    assert evaluate_goal(goal, fen, line[:-1]).status == "in_progress"
    status = evaluate_goal(goal, fen, line)
    assert status.status == "success"
    assert status.moves_used == 3


def test_survive_goal():
    goal = survive_knight(max_moves=2)
    status = evaluate_goal(goal, QUEEN_VS_KNIGHT, ["a1a2", "d5f4"])
    assert status.status == "in_progress"
    status = evaluate_goal(goal, QUEEN_VS_KNIGHT, ["a1a2", "d5f4", "a2a3"])
    assert status.status == "success"
    assert status.detail == "The knight survived 2 moves."
    status = evaluate_goal(goal, QUEEN_VS_KNIGHT, ["a1a2", "d5c3", "a2c2", "c3e4", "c2e4"])
    assert status.status == "success"  # survived 2 attacker moves before the capture
    status = evaluate_goal(goal, QUEEN_VS_KNIGHT, ["a1d4", "d5c3", "d4c3"])
    assert status.status == "fail"


def test_survive_tracks_specific_piece():
    goal = survive_knight(max_moves=2, square="d5")
    # Losing the other knight does not matter.
    assert evaluate_goal(goal, QUEEN_VS_TWO_KNIGHTS, ["a1b1"]).status == "in_progress"
    assert evaluate_goal(goal, QUEEN_VS_TWO_KNIGHTS, ["a1b1", "d5f4", "b1b2"]).status == "success"


def test_survive_requires_move_count():
    with pytest.raises(GoalError):
        evaluate_goal(survive_knight(), QUEEN_VS_KNIGHT, [])


def test_goal_is_decided_when_the_defender_cannot_move():
    # The knight on a8 is boxed in by its own pawns, which are blocked by white's.
    fen = "n7/2p5/1pP5/1P6/8/8/8/7Q b - - 0 1"
    status = evaluate_goal(capture_knight(), fen, [])
    assert status.status == "fail"
    assert "no legal moves" in status.detail
    status = evaluate_goal(survive_knight(max_moves=5), fen, [])
    assert status.status == "success"
    assert "No legal moves" in status.detail


def test_checkmate_goal():
    status = evaluate_goal(white_goal("checkmate"), BACK_RANK_MATE, ["a1a8"])
    assert status.status == "success"
    assert status.detail == "Checkmate in 1 move."


def test_checkmate_move_limit():
    goal = white_goal("checkmate", max_moves=1)
    status = evaluate_goal(goal, BACK_RANK_MATE, ["a1a7"])
    assert status.status == "fail"
    assert "within 1 move" in status.detail
    assert evaluate_goal(goal, BACK_RANK_MATE, ["a1a8"]).status == "success"


def test_checkmate_requires_kings():
    with pytest.raises(GoalError, match="king"):
        evaluate_goal(white_goal("checkmate"), QUEEN_VS_KNIGHT, [])


def test_promote_goal():
    status = evaluate_goal(white_goal("promote"), "8/1P6/8/8/8/8/8/8 w - - 0 1", ["b7b8q"])
    assert status.status == "success"


def test_promote_fails_within_limit_or_without_pawns():
    goal = white_goal("promote", max_moves=1)
    status = evaluate_goal(goal, "8/8/1P6/8/8/8/8/8 w - - 0 1", ["b6b7"])
    assert status.status == "fail"
    assert "within 1 move" in status.detail

    status = evaluate_goal(white_goal("promote"), "8/1P6/8/8/8/8/8/1r6 b - - 0 1", ["b1b7"])
    assert status.status == "fail"
    assert "No pawns" in status.detail


def test_target_missing_is_an_error():
    goal = Goal(type="capture", params=GoalParams(color="black", piece="r"))
    with pytest.raises(GoalError, match="no black rook"):
        evaluate_goal(goal, QUEEN_VS_KNIGHT, [])


def test_goal_validation_errors():
    with pytest.raises(GoalError, match="is not a square"):
        evaluate_goal(capture_knight(square="z9"), QUEEN_VS_KNIGHT, [])
    with pytest.raises(GoalError, match="no black knight on d4"):
        evaluate_goal(capture_knight(square="d4"), QUEEN_VS_KNIGHT, [])
    with pytest.raises(GoalError, match="needs a color"):
        evaluate_goal(Goal(type="promote"), QUEEN_VS_KNIGHT, [])
    with pytest.raises(GoalError, match="no pawns"):
        evaluate_goal(white_goal("promote"), QUEEN_VS_KNIGHT, [])


def test_free_goal_and_illegal_moves():
    goal = Goal()
    status = evaluate_goal(goal, QUEEN_VS_KNIGHT, ["a1a2"])
    assert status.status == "in_progress"
    with pytest.raises(IllegalMoveError, match="Move 1"):
        evaluate_goal(goal, QUEEN_VS_KNIGHT, ["d5c3"])
