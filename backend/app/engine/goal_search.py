"""Goal-aware alpha-beta search.

Scores are from the goal actor's point of view (the attacker for capture/survive, the
achieving side for checkmate/promote, the side to move for free practice): the actor
maximizes and the other side minimizes. Decided positions come from ``GoalState.status``,
so the search plays by exactly the same rules as the referee:

- the actor reaching its aim scores ``WIN - plies`` (sooner is better for the actor, later
  is better for the defender, which is how "delay the capture" falls out);
- the actor failing scores ``-WIN + plies``.

Undecided leaves get a heuristic that measures how close the aim is.
"""

import time

import chess
import chess.polyglot

from app.chess_service import captured_square
from app.engine.base import EngineChoice
from app.goals import GoalState

WIN = 100_000
WIN_THRESHOLD = WIN - 1_000
INFINITY = 10 * WIN
MAX_DEPTH = 64
QUIESCENCE_DEPTH = 6
EXACT, LOWER, UPPER = 0, 1, 2

PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 300,
    chess.BISHOP: 320,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 0,
}


class _Timeout(Exception):
    pass


class GoalSearchEngine:
    name = "goal_search"

    def supports(self, state: GoalState) -> bool:
        return True

    def choose(self, state: GoalState, think_ms: int) -> EngineChoice:
        search = _Search(state, think_ms / 1000)
        move, score, depth = search.run()
        engine_score = score if state.board.turn == search.actor else -score
        return EngineChoice(
            move=move,
            engine=self.name,
            depth=depth,
            score=engine_score,
            note=_describe(engine_score),
        )


def _describe(score: int) -> str:
    if score >= WIN_THRESHOLD:
        return f"Sees a forced win in {WIN - score} plies."
    if score <= -WIN_THRESHOLD:
        return f"Sees a forced loss in {WIN + score} plies."
    return f"Evaluation {score / 100:+.2f}."


class _Search:
    def __init__(self, state: GoalState, seconds: float):
        self.state = state
        self.board = state.board
        self.actor = state.actor if state.actor is not None else state.board.turn
        self.deadline = time.monotonic() + seconds
        self.root_ply = state.ply
        self.nodes = 0
        self.table: dict[tuple, tuple[int, int, int, chess.Move | None]] = {}

    def run(self) -> tuple[chess.Move, int, int]:
        moves = self.ordered(None)
        if len(moves) == 1:
            return moves[0], self.evaluate(), 0
        best_move, best_score, completed = moves[0], 0, 0
        for depth in range(1, MAX_DEPTH + 1):
            try:
                best_score, best_move = self.root(depth, best_move)
            except _Timeout:
                break
            completed = depth
            if abs(best_score) >= WIN_THRESHOLD or self.exhausted(depth):
                break
            if time.monotonic() >= self.deadline:
                break
        return best_move, best_score, completed

    def exhausted(self, depth: int) -> bool:
        """True once the search reaches past the goal's move limit (every line is decided)."""
        limit = self.state.params.max_moves
        if limit is None or self.state.goal.type == "free":
            return False
        return depth > 2 * (limit - self.state.actor_moves) + 1

    def root(self, depth: int, first: chess.Move) -> tuple[int, chess.Move]:
        maximizing = self.board.turn == self.actor
        alpha, beta = -INFINITY, INFINITY
        best_score = -INFINITY if maximizing else INFINITY
        best_move = first
        for move in self.ordered(first):
            self.state.push(move)
            try:
                score = self.search(depth - 1, alpha, beta)
            finally:
                self.state.pop()
            if maximizing and score > best_score:
                best_score, best_move = score, move
                alpha = max(alpha, score)
            elif not maximizing and score < best_score:
                best_score, best_move = score, move
                beta = min(beta, score)
        return best_score, best_move

    def tick(self) -> None:
        self.nodes += 1
        if self.nodes % 512 == 0 and time.monotonic() >= self.deadline:
            raise _Timeout

    def search(self, depth: int, alpha: int, beta: int) -> int:
        self.tick()
        terminal = self.terminal()
        if terminal is not None:
            return terminal
        if depth <= 0:
            return self.quiesce(alpha, beta, QUIESCENCE_DEPTH)

        key = self.key()
        tt_move = None
        entry = self.table.get(key)
        if entry is not None:
            entry_depth, entry_score, entry_flag, tt_move = entry
            if entry_depth >= depth:
                if entry_flag == EXACT:
                    return entry_score
                if entry_flag == LOWER:
                    alpha = max(alpha, entry_score)
                else:
                    beta = min(beta, entry_score)
                if alpha >= beta:
                    return entry_score

        maximizing = self.board.turn == self.actor
        original_alpha, original_beta = alpha, beta
        best = -INFINITY if maximizing else INFINITY
        best_move = None
        for move in self.ordered(tt_move):
            self.state.push(move)
            try:
                score = self.search(depth - 1, alpha, beta)
            finally:
                self.state.pop()
            if maximizing:
                if score > best:
                    best, best_move = score, move
                alpha = max(alpha, best)
            else:
                if score < best:
                    best, best_move = score, move
                beta = min(beta, best)
            if alpha >= beta:
                break

        if best <= original_alpha:
            flag = UPPER
        elif best >= original_beta:
            flag = LOWER
        else:
            flag = EXACT
        self.table[key] = (depth, best, flag, best_move)
        return best

    def quiesce(self, alpha: int, beta: int, depth: int) -> int:
        """Search captures and promotions only, so a hanging target is never missed."""
        self.tick()
        terminal = self.terminal()
        if terminal is not None:
            return terminal
        stand = self.evaluate()
        if depth == 0:
            return stand
        maximizing = self.board.turn == self.actor
        if maximizing:
            if stand >= beta:
                return stand
            alpha = max(alpha, stand)
        else:
            if stand <= alpha:
                return stand
            beta = min(beta, stand)
        best = stand
        for move in self.ordered(None, tactical_only=True):
            self.state.push(move)
            try:
                score = self.quiesce(alpha, beta, depth - 1)
            finally:
                self.state.pop()
            if maximizing:
                best = max(best, score)
                alpha = max(alpha, best)
            else:
                best = min(best, score)
                beta = min(beta, best)
            if alpha >= beta:
                break
        return best

    def terminal(self) -> int | None:
        plies = self.state.ply - self.root_ply
        result = self.state.status()
        if result is not None:
            actor_won = (result.status == "success") != (self.state.goal.type == "survive")
            return WIN - plies if actor_won else -WIN + plies
        if self.state.goal.type == "free" and not any(self.board.legal_moves):
            if not self.board.is_checkmate():
                return 0
            return -WIN + plies if self.board.turn == self.actor else WIN - plies
        return None

    def key(self) -> tuple:
        tracker = self.state.tracker
        return (
            chess.polyglot.zobrist_hash(self.board),
            self.state.actor_moves,
            self.state.promoted,
            tracker.snapshot() if tracker else None,
        )

    def target_squares(self) -> set[chess.Square]:
        tracker = self.state.tracker
        if tracker is None or tracker.captured:
            return set()
        if tracker.square is not None:
            return {tracker.square}
        return set(self.board.pieces(tracker.piece_type, tracker.color))

    def ordered(self, first: chess.Move | None, tactical_only: bool = False) -> list[chess.Move]:
        board = self.board
        targets = self.target_squares()
        wants_checks = self.state.goal.type in ("checkmate", "free")
        scored = []
        for move in board.legal_moves:
            taken = captured_square(board, move)
            if tactical_only and taken is None and move.promotion is None:
                continue
            if move == first:
                scored.append((10_000_000, move))
                continue
            score = 0
            if taken is not None:
                victim = board.piece_at(taken)
                mover = board.piece_at(move.from_square)
                score += 10_000 + 10 * PIECE_VALUES[victim.piece_type]
                score -= PIECE_VALUES[mover.piece_type] if mover else 0
                if taken in targets:
                    score += 1_000_000
            if move.promotion is not None:
                score += 50_000 + PIECE_VALUES[move.promotion]
            if wants_checks and board.gives_check(move):
                score += 5_000
            scored.append((score, move))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [move for _, move in scored]

    def material(self, color: chess.Color) -> int:
        return sum(
            value * len(self.board.pieces(piece_type, color))
            for piece_type, value in PIECE_VALUES.items()
        )

    def evaluate(self) -> int:
        material = self.material(self.actor) - self.material(not self.actor)
        goal_type = self.state.goal.type
        if goal_type in ("capture", "survive"):
            return material // 4 + self.target_score()
        if goal_type == "promote":
            return material // 4 + self.promotion_score()
        if goal_type == "checkmate":
            return material + self.mating_score()
        return material

    def target_score(self) -> int:
        """How close the attacker is to taking the most vulnerable target."""
        board, actor = self.board, self.actor
        attackers = list(chess.SquareSet(board.occupied_co[actor]))
        best = -INFINITY
        for target in self.target_squares():
            score = 120 if board.is_attacked_by(actor, target) else 0
            escapes = 0
            for square in board.attacks(target):
                occupant = board.piece_at(square)
                if occupant is not None and occupant.color != actor:
                    continue
                if not board.is_attacked_by(actor, square):
                    escapes += 1
            score -= 15 * escapes
            if attackers:
                score -= 8 * min(chess.square_distance(a, target) for a in attackers)
            best = max(best, score)
        return 0 if best == -INFINITY else best

    def promotion_score(self) -> int:
        board, actor = self.board, self.actor
        pawns = board.pieces(chess.PAWN, actor)
        if not pawns:
            return -500
        best = -INFINITY
        for pawn in pawns:
            rank = chess.square_rank(pawn)
            distance = 7 - rank if actor == chess.WHITE else rank
            score = -40 * distance
            step = pawn + 8 if actor == chess.WHITE else pawn - 8
            if 0 <= step < 64 and board.piece_at(step) is not None:
                score -= 60
            if board.is_attacked_by(not actor, pawn) and not board.is_attacked_by(actor, pawn):
                score -= 80
            best = max(best, score)
        return best

    def mating_score(self) -> int:
        """Drive the defending king to the edge and bring the attacking king closer."""
        board, actor = self.board, self.actor
        king = board.king(not actor)
        if king is None:
            return 0
        file, rank = chess.square_file(king), chess.square_rank(king)
        edge_closeness = 3 - min(file, 7 - file, rank, 7 - rank)
        score = 25 * edge_closeness
        own_king = board.king(actor)
        if own_king is not None:
            score -= 6 * chess.square_distance(own_king, king)
        mobility = 0
        for square in board.attacks(king):
            occupant = board.piece_at(square)
            if occupant is not None and occupant.color != actor:
                continue
            if not board.is_attacked_by(actor, square):
                mobility += 1
        return score - 12 * mobility
