import chess
import pytest

from app.chess_service import (
    IllegalMoveError,
    InvalidPositionError,
    apply_move,
    describe_position,
    parse_fen,
    replay,
)

QUEEN_VS_KNIGHT = "8/8/8/3n4/8/8/8/3Q4 w - - 0 1"


def test_parses_board_only_fen_without_kings():
    board = parse_fen("8/8/8/3n4/8/8/8/3Q4")
    assert board.fen() == QUEEN_VS_KNIGHT


def test_rejects_garbage():
    with pytest.raises(InvalidPositionError):
        parse_fen("not a fen")
    with pytest.raises(InvalidPositionError):
        parse_fen("   ")


def test_kingless_position_has_moves_and_warnings():
    info = describe_position(parse_fen(QUEEN_VS_KNIGHT))
    assert info["turn"] == "white"
    assert info["has_legal_moves"]
    assert not info["is_check"]
    assert any(m["uci"] == "d1d5" and m["san"] == "Qxd5" for m in info["legal_moves"])
    assert any("No white king" in w for w in info["warnings"])
    assert any("No black king" in w for w in info["warnings"])


def test_drops_impossible_castling_and_en_passant_rights():
    board = parse_fen("4k3/8/8/8/8/8/8/8 w KQkq e6 0 1")
    assert board.fen() == "4k3/8/8/8/8/8/8/8 w - - 0 1"
    assert board.ep_square is None


def test_keeps_real_en_passant():
    board = parse_fen("4k3/8/8/3Pp3/8/8/8/4K3 w - e6 0 1")
    assert board.ep_square == chess.E6
    outcome = apply_move(board, "d5e6")
    assert outcome.captured == chess.Piece(chess.PAWN, chess.BLACK)


def test_apply_move_reports_capture_and_does_not_mutate_input():
    board = parse_fen(QUEEN_VS_KNIGHT)
    outcome = apply_move(board, "d1d5")
    assert outcome.san == "Qxd5"
    assert outcome.captured == chess.Piece(chess.KNIGHT, chess.BLACK)
    assert outcome.board.fen() == "8/8/8/3Q4/8/8/8/8 b - - 0 1"
    assert board.fen() == QUEEN_VS_KNIGHT


def test_illegal_moves_are_rejected():
    board = parse_fen(QUEEN_VS_KNIGHT)
    with pytest.raises(IllegalMoveError):
        apply_move(board, "d1e3")
    with pytest.raises(IllegalMoveError):
        apply_move(board, "zz")


def test_replay_reports_failing_ply():
    with pytest.raises(IllegalMoveError, match="Move 2"):
        replay(QUEEN_VS_KNIGHT, ["d1d2", "d1d3"])
    outcomes = replay(QUEEN_VS_KNIGHT, ["d1d2", "d5f4"])
    assert [o.san for o in outcomes] == ["Qd2", "Nf4"]
