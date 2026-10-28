from datetime import UTC, datetime

from app.models import Attempt
from app.scenario_service import attempt_stats

WHEN = datetime(2026, 10, 27, 10, 0, tzinfo=UTC)


def attempt(id: int, result: str, moves_used: int, duration_ms: int = 1000) -> Attempt:
    return Attempt(
        id=id,
        scenario_id=1,
        started_at=WHEN,
        ended_at=WHEN,
        moves=[],
        result=result,
        ply_count=2 * moves_used,
        moves_used=moves_used,
        duration_ms=duration_ms,
    )


def best_id(goal_type: str, attempts: list[Attempt]) -> int | None:
    best = attempt_stats(goal_type, attempts).best
    return best.id if best else None


def test_counts_and_empty_stats():
    stats = attempt_stats("capture", [])
    assert (stats.count, stats.success_count, stats.best) == (0, 0, None)
    stats = attempt_stats("capture", [attempt(1, "success", 3), attempt(2, "abandoned", 1)])
    assert (stats.count, stats.success_count) == (2, 1)


def test_fewest_moves_goals_prefer_quickest_success():
    attempts = [
        attempt(1, "fail", 1),
        attempt(2, "success", 4, duration_ms=5000),
        attempt(3, "success", 2, duration_ms=9000),
        attempt(4, "success", 2, duration_ms=3000),
    ]
    for goal_type in ("capture", "checkmate", "promote"):
        assert best_id(goal_type, attempts) == 4
    assert best_id("capture", [attempt(1, "fail", 1)]) is None


def test_survive_goals_prefer_success_then_longest_attempt():
    assert best_id("survive", [attempt(1, "fail", 2), attempt(2, "fail", 5)]) == 2
    assert best_id("survive", [attempt(1, "fail", 5), attempt(2, "success", 3)]) == 2
    assert best_id("survive", [attempt(1, "abandoned", 9)]) is None


def test_free_goal_has_no_best_attempt():
    assert best_id("free", [attempt(1, "success", 1)]) is None
