"""Scenario goal evaluation.

A goal is evaluated by replaying the attempt's moves from the starting position. The
"actor" is the side whose moves are counted: the attacker for capture/survive goals and
the achieving side for checkmate/promote goals.
"""

from dataclasses import dataclass

import chess

from app.chess_service import (
    COLOR_NAMES,
    COLORS_BY_NAME,
    PIECE_TYPES_BY_LETTER,
    IllegalMoveError,
    captured_square,
    parse_fen,
    parse_legal_move,
)
from app.schemas import Goal


class GoalError(ValueError):
    pass


@dataclass
class GoalResult:
    status: str
    detail: str
    moves_used: int
    ply_count: int


def _plural(count: int, word: str) -> str:
    return f"{count} {word}" if count == 1 else f"{count} {word}s"


def validate_goal(goal: Goal, board: chess.Board) -> list[str]:
    params = goal.params
    errors = []
    if goal.type in ("capture", "survive"):
        if params.color is None or params.piece is None:
            errors.append("This goal needs a target color and piece.")
        else:
            color = COLORS_BY_NAME[params.color]
            piece_type = PIECE_TYPES_BY_LETTER[params.piece]
            label = f"{params.color} {chess.piece_name(piece_type)}"
            if params.square:
                try:
                    square = chess.parse_square(params.square)
                except ValueError:
                    errors.append(f"'{params.square}' is not a square.")
                else:
                    if board.piece_at(square) != chess.Piece(piece_type, color):
                        errors.append(f"There is no {label} on {params.square}.")
            elif not board.pieces(piece_type, color):
                errors.append(f"There is no {label} on the board.")
        if goal.type == "survive" and params.max_moves is None:
            errors.append("A survive goal needs a number of moves.")
    elif goal.type in ("checkmate", "promote"):
        if params.color is None:
            errors.append("This goal needs a color.")
        elif goal.type == "checkmate":
            for color in chess.COLORS:
                if len(board.pieces(chess.KING, color)) != 1:
                    errors.append("Checkmate goals need exactly one king per side.")
                    break
        elif not board.pieces(chess.PAWN, COLORS_BY_NAME[params.color]):
            errors.append(f"{params.color.capitalize()} has no pawns to promote.")
    return errors


class _TargetTracker:
    """Follows the target piece of a capture/survive goal through the game.

    With a square the exact piece is tracked; without one the target counts as captured
    once every piece of that color and type has been taken.
    """

    def __init__(
        self,
        board: chess.Board,
        color: chess.Color,
        piece_type: chess.PieceType,
        square: chess.Square | None,
    ):
        self.color = color
        self.piece_type = piece_type
        self.square = square
        self.remaining = len(board.pieces(piece_type, color))
        self.captured = False

    def before_push(self, board: chess.Board, move: chess.Move) -> None:
        if self.captured:
            return
        taken = captured_square(board, move)
        if self.square is None:
            if taken is not None and board.piece_at(taken) == chess.Piece(
                self.piece_type, self.color
            ):
                self.remaining -= 1
                self.captured = self.remaining == 0
            return
        if taken == self.square:
            self.captured = True
        elif move.from_square == self.square:
            self.square = move.to_square
        elif board.is_castling(move) and board.turn == self.color:
            rank = chess.square_rank(move.from_square)
            kingside = chess.square_file(move.to_square) > chess.square_file(move.from_square)
            rook_from = chess.square(7 if kingside else 0, rank)
            if rook_from == self.square:
                self.square = chess.square(5 if kingside else 3, rank)


def evaluate_goal(goal: Goal, start_fen: str, moves: list[str]) -> GoalResult:
    board = parse_fen(start_fen)
    errors = validate_goal(goal, board)
    if errors:
        raise GoalError(" ".join(errors))

    params = goal.params
    tracker = None
    target_label = ""
    if goal.type in ("capture", "survive"):
        target_color = COLORS_BY_NAME[params.color]
        piece_type = PIECE_TYPES_BY_LETTER[params.piece]
        square = chess.parse_square(params.square) if params.square else None
        tracker = _TargetTracker(board, target_color, piece_type, square)
        actor = not target_color
        target_label = chess.piece_name(piece_type)
    elif goal.type in ("checkmate", "promote"):
        actor = COLORS_BY_NAME[params.color]
    else:
        actor = None

    actor_moves = 0
    promoted = False

    def check(ply: int) -> GoalResult | None:
        def result(status: str, detail: str) -> GoalResult:
            return GoalResult(status, detail, actor_moves, ply)

        no_moves = not any(board.legal_moves)
        side_to_move = COLOR_NAMES[board.turn]
        limit = params.max_moves

        if goal.type == "capture":
            if tracker.captured:
                return result(
                    "success", f"Captured the {target_label} in {_plural(actor_moves, 'move')}."
                )
            if limit is not None and actor_moves >= limit:
                return result("fail", f"The {target_label} survived {_plural(limit, 'move')}.")
            if no_moves:
                return result("fail", f"{side_to_move.capitalize()} has no legal moves.")
        elif goal.type == "survive":
            if tracker.captured:
                return result(
                    "fail", f"The {target_label} was captured after {_plural(actor_moves, 'move')}."
                )
            if actor_moves >= limit:
                return result("success", f"The {target_label} survived {_plural(limit, 'move')}.")
            if no_moves:
                return result("success", f"No legal moves left; the {target_label} survived.")
        elif goal.type == "checkmate":
            if board.is_checkmate():
                if board.turn != actor:
                    return result("success", f"Checkmate in {_plural(actor_moves, 'move')}.")
                return result("fail", f"{COLOR_NAMES[actor].capitalize()} was checkmated.")
            if no_moves:
                return result("fail", "Stalemate.")
            if limit is not None and actor_moves >= limit:
                return result("fail", f"No checkmate within {_plural(limit, 'move')}.")
        elif goal.type == "promote":
            if promoted:
                return result("success", f"Promoted in {_plural(actor_moves, 'move')}.")
            if limit is not None and actor_moves >= limit:
                return result("fail", f"No promotion within {_plural(limit, 'move')}.")
            if not board.pieces(chess.PAWN, actor):
                return result("fail", "No pawns left to promote.")
            if no_moves:
                return result("fail", f"{side_to_move.capitalize()} has no legal moves.")
        return None

    outcome = check(0)
    if outcome is not None:
        return outcome
    for ply, uci in enumerate(moves, start=1):
        try:
            move = parse_legal_move(board, uci)
        except IllegalMoveError as exc:
            raise IllegalMoveError(f"Move {ply}: {exc}") from exc
        mover = board.turn
        if tracker is not None:
            tracker.before_push(board, move)
        board.push(move)
        if mover == actor:
            actor_moves += 1
            promoted = promoted or move.promotion is not None
        outcome = check(ply)
        if outcome is not None:
            return outcome

    if goal.type == "free":
        return GoalResult("in_progress", "Free practice.", len(moves), len(moves))
    limit = params.max_moves
    used = f"{actor_moves} of {limit}" if limit else str(actor_moves)
    return GoalResult("in_progress", f"Moves used: {used}.", actor_moves, len(moves))
