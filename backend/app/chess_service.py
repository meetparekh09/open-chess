"""Position handling that tolerates "illegal" setups such as positions without kings.

python-chess falls back to pseudo-legal move generation for a side that has no king,
so we never call ``Board.is_valid()`` as a gate. Problems are reported as warnings and
only an unparseable FEN is rejected.
"""

from dataclasses import dataclass

import chess

COLOR_NAMES = {chess.WHITE: "white", chess.BLACK: "black"}
COLORS_BY_NAME = {"white": chess.WHITE, "black": chess.BLACK}
PIECE_TYPES_BY_LETTER = {
    "p": chess.PAWN,
    "n": chess.KNIGHT,
    "b": chess.BISHOP,
    "r": chess.ROOK,
    "q": chess.QUEEN,
    "k": chess.KING,
}


class InvalidPositionError(ValueError):
    pass


class IllegalMoveError(ValueError):
    pass


@dataclass
class MoveOutcome:
    uci: str
    san: str
    captured: chess.Piece | None
    board: chess.Board


def parse_fen(fen: str) -> chess.Board:
    """Parse a full or board-only FEN, dropping castling/en passant rights that cannot apply."""
    text = " ".join(fen.split())
    if not text:
        raise InvalidPositionError("FEN is empty.")
    try:
        board = chess.Board(text)
    except ValueError as exc:
        raise InvalidPositionError(f"Invalid FEN: {exc}") from exc
    board.castling_rights = board.clean_castling_rights()
    _clean_ep_square(board)
    return board


def _clean_ep_square(board: chess.Board) -> None:
    ep_square = board.ep_square
    if ep_square is None:
        return
    if board.turn == chess.WHITE:
        expected_rank, pawn_square = 5, ep_square - 8
    else:
        expected_rank, pawn_square = 2, ep_square + 8
    if (
        chess.square_rank(ep_square) != expected_rank
        or board.piece_at(ep_square) is not None
        or board.piece_at(pawn_square) != chess.Piece(chess.PAWN, not board.turn)
    ):
        board.ep_square = None


def position_warnings(board: chess.Board) -> list[str]:
    warnings = []
    for color in chess.COLORS:
        name = COLOR_NAMES[color]
        king_count = len(board.pieces(chess.KING, color))
        if king_count == 0:
            warnings.append(f"No {name} king: check and checkmate do not apply to {name}.")
        elif king_count > 1:
            warnings.append(f"{name.capitalize()} has {king_count} kings.")
    if board.pawns & (chess.BB_RANK_1 | chess.BB_RANK_8):
        warnings.append("There are pawns on the first or last rank.")
    if board.was_into_check():
        side = COLOR_NAMES[not board.turn]
        warnings.append(f"{side.capitalize()} is in check but it is not {side}'s turn.")
    return warnings


def captured_square(board: chess.Board, move: chess.Move) -> chess.Square | None:
    """Square of the piece that ``move`` captures, if any (handles en passant)."""
    if board.is_en_passant(move):
        return move.to_square + (-8 if board.turn == chess.WHITE else 8)
    target = board.piece_at(move.to_square)
    if target is not None and target.color != board.turn:
        return move.to_square
    return None


def legal_moves(board: chess.Board) -> list[dict]:
    return [
        {
            "uci": move.uci(),
            "san": board.san(move),
            "from_square": chess.square_name(move.from_square),
            "to_square": chess.square_name(move.to_square),
            "promotion": chess.piece_symbol(move.promotion) if move.promotion else None,
        }
        for move in board.legal_moves
    ]


def describe_position(board: chess.Board) -> dict:
    moves = legal_moves(board)
    return {
        "fen": board.fen(),
        "turn": COLOR_NAMES[board.turn],
        "legal_moves": moves,
        "warnings": position_warnings(board),
        "is_check": board.is_check(),
        "is_checkmate": board.is_checkmate(),
        "has_legal_moves": bool(moves),
    }


def parse_legal_move(board: chess.Board, uci: str) -> chess.Move:
    try:
        move = chess.Move.from_uci(uci)
    except ValueError as exc:
        raise IllegalMoveError(f"'{uci}' is not a UCI move.") from exc
    if move not in board.legal_moves:
        raise IllegalMoveError(f"'{uci}' is not legal in this position.")
    return move


def apply_move(board: chess.Board, uci: str) -> MoveOutcome:
    """Play ``uci`` on a copy of ``board``."""
    board = board.copy(stack=False)
    move = parse_legal_move(board, uci)
    square = captured_square(board, move)
    captured = board.piece_at(square) if square is not None else None
    san = board.san(move)
    board.push(move)
    return MoveOutcome(uci=move.uci(), san=san, captured=captured, board=board)


def replay(start_fen: str, moves: list[str]) -> list[MoveOutcome]:
    board = parse_fen(start_fen)
    outcomes = []
    for ply, uci in enumerate(moves, start=1):
        try:
            outcome = apply_move(board, uci)
        except IllegalMoveError as exc:
            raise IllegalMoveError(f"Move {ply}: {exc}") from exc
        outcomes.append(outcome)
        board = outcome.board
    return outcomes
