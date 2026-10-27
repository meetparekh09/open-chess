QUEEN_VS_KNIGHT = "8/8/8/3n4/8/8/8/Q7 w - - 0 1"

SCENARIO = {
    "title": "Queen hunts knight",
    "description": "Trap and win the lone knight.",
    "start_fen": "8/8/8/3n4/8/8/8/Q7",
    "player_side": "white",
    "goal": {"type": "capture", "params": {"color": "black", "piece": "n", "max_moves": 10}},
    "difficulty": 2,
    "tags": ["Queen", "knight", "queen "],
}
WINNING_LINE = ["a1a2", "d5c3", "a2c2", "c3e4", "c2e4"]


def create(client, **overrides):
    response = client.post("/api/scenarios", json={**SCENARIO, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


def test_validate_and_move(client):
    response = client.post("/api/positions/validate", json={"fen": "8/8/8/3n4/8/8/8/Q7"})
    assert response.status_code == 200
    body = response.json()
    assert body["fen"] == QUEEN_VS_KNIGHT
    assert body["turn"] == "white"
    assert len(body["warnings"]) == 2

    response = client.post("/api/positions/move", json={"fen": QUEEN_VS_KNIGHT, "move_uci": "a1d4"})
    assert response.status_code == 200
    assert response.json()["san"] == "Qd4"
    assert response.json()["position"]["turn"] == "black"

    response = client.post("/api/positions/move", json={"fen": QUEEN_VS_KNIGHT, "move_uci": "a1b3"})
    assert response.status_code == 422
    response = client.post("/api/positions/validate", json={"fen": "nonsense"})
    assert response.status_code == 422


def test_scenario_crud_and_filters(client):
    scenario = create(client)
    assert scenario["start_fen"] == QUEEN_VS_KNIGHT
    assert scenario["tags"] == ["queen", "knight"]
    assert scenario["stats"] == {"count": 0, "success_count": 0, "best": None}

    create(
        client,
        title="Free play",
        description="",
        goal={"type": "free"},
        tags=["sandbox"],
        difficulty=1,
    )

    assert len(client.get("/api/scenarios").json()) == 2
    assert [s["title"] for s in client.get("/api/scenarios?tag=knight").json()] == [
        "Queen hunts knight"
    ]
    assert len(client.get("/api/scenarios?goal_type=free").json()) == 1
    assert len(client.get("/api/scenarios?difficulty=2").json()) == 1
    assert len(client.get("/api/scenarios?q=lone%20knight").json()) == 1
    assert client.get("/api/scenarios/tags").json() == ["knight", "queen", "sandbox"]

    updated = client.put(f"/api/scenarios/{scenario['id']}", json={**SCENARIO, "title": "Renamed"})
    assert updated.status_code == 200
    assert updated.json()["title"] == "Renamed"

    assert client.delete(f"/api/scenarios/{scenario['id']}").status_code == 204
    assert client.get(f"/api/scenarios/{scenario['id']}").status_code == 404


def test_invalid_goal_is_rejected(client):
    response = client.post(
        "/api/scenarios",
        json={**SCENARIO, "goal": {"type": "checkmate", "params": {"color": "white"}}},
    )
    assert response.status_code == 422
    assert "king" in response.json()["detail"]


def test_solution_and_position_change(client):
    scenario = create(client)
    steps = [{"move_uci": uci, "comment": f"step {i}"} for i, uci in enumerate(WINNING_LINE)]
    response = client.put(f"/api/scenarios/{scenario['id']}/solution", json={"steps": steps})
    assert response.status_code == 200
    solution = response.json()["solution"]
    assert [s["san"] for s in solution] == ["Qa2", "Nc3", "Qc2", "Ne4", "Qxe4"]
    assert solution[-1]["fen_after"] == "8/8/8/8/4Q3/8/8/8 b - - 0 3"

    bad = client.put(
        f"/api/scenarios/{scenario['id']}/solution",
        json={"steps": [{"move_uci": "a1h8"}, {"move_uci": "a1a2"}]},
    )
    assert bad.status_code == 422

    moved = {**SCENARIO, "start_fen": "8/8/8/3n4/8/8/8/1Q6"}
    assert client.put(f"/api/scenarios/{scenario['id']}", json=moved).status_code == 409
    response = client.put(f"/api/scenarios/{scenario['id']}?clear_solution=true", json=moved)
    assert response.status_code == 200
    assert response.json()["solution"] == []


def test_attempts_and_stats(client):
    scenario = create(client)
    url = f"/api/scenarios/{scenario['id']}/attempts"
    times = {"started_at": "2026-10-27T10:00:00Z", "ended_at": "2026-10-27T10:00:30Z"}

    response = client.post(url, json={**times, "moves": WINNING_LINE})
    assert response.status_code == 201
    attempt = response.json()
    assert attempt["result"] == "success"
    assert attempt["moves_used"] == 3
    assert attempt["duration_ms"] == 30000

    abandoned = client.post(url, json={**times, "moves": ["a1a2"], "abandoned": True})
    assert abandoned.json()["result"] == "abandoned"

    assert client.post(url, json={**times, "moves": ["a1b3"]}).status_code == 422
    assert len(client.get(url).json()) == 2

    stats = client.get(f"/api/scenarios/{scenario['id']}").json()["stats"]
    assert stats["count"] == 2
    assert stats["success_count"] == 1
    assert stats["best"]["moves_used"] == 3


def test_goal_evaluate_endpoint(client):
    scenario = create(client)
    response = client.post(
        "/api/goals/evaluate", json={"scenario_id": scenario["id"], "moves": WINNING_LINE}
    )
    assert response.json()["status"] == "success"

    response = client.post(
        "/api/goals/evaluate",
        json={"start_fen": QUEEN_VS_KNIGHT, "goal": {"type": "free"}, "moves": ["a1a2"]},
    )
    assert response.json()["status"] == "in_progress"
    assert client.post("/api/goals/evaluate", json={"moves": []}).status_code == 422


def test_export_import_roundtrip(client):
    scenario = create(client)
    client.put(
        f"/api/scenarios/{scenario['id']}/solution",
        json={"steps": [{"move_uci": "a1a2", "comment": "Cut off the knight"}]},
    )
    bundle = client.get("/api/scenarios/export").json()
    assert bundle["version"] == 1
    assert bundle["scenarios"][0]["solution"] == [
        {"move_uci": "a1a2", "comment": "Cut off the knight"}
    ]

    response = client.post("/api/scenarios/import", json=bundle)
    assert response.status_code == 200
    new_id = response.json()["ids"][0]
    imported = client.get(f"/api/scenarios/{new_id}").json()
    assert imported["title"] == "Queen hunts knight"
    assert imported["solution"][0]["san"] == "Qa2"

    bundle["scenarios"][0]["solution"] = [{"move_uci": "h8h1"}]
    response = client.post("/api/scenarios/import", json=bundle)
    assert response.status_code == 422
    assert len(client.get("/api/scenarios").json()) == 2
