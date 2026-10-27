from app.engine.stockfish import close_stockfish, stockfish_path

QUEEN_VS_KNIGHT = "8/8/8/3n4/8/8/8/3Q4 w - - 0 1"
CAPTURE_KNIGHT = {"type": "capture", "params": {"color": "black", "piece": "n", "max_moves": 5}}


def test_goal_search_reply(client):
    response = client.post(
        "/api/engine/move",
        json={
            "start_fen": QUEEN_VS_KNIGHT,
            "moves": ["d1d2"],
            "goal": CAPTURE_KNIGHT,
            "mode": "goal_search",
            "think_ms": 200,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["engine"] == "goal_search"
    assert body["uci"].startswith("d5")
    assert body["position"]["turn"] == "white"
    assert body["note"]


def test_auto_on_kingless_position_uses_goal_search(client):
    response = client.post(
        "/api/engine/move",
        json={"start_fen": QUEEN_VS_KNIGHT, "goal": CAPTURE_KNIGHT, "think_ms": 100},
    )
    assert response.status_code == 200, response.text
    assert response.json()["engine"] == "goal_search"
    assert response.json()["uci"] == "d1d5"


def test_decided_attempt_is_rejected(client):
    response = client.post(
        "/api/engine/move",
        json={
            "start_fen": QUEEN_VS_KNIGHT,
            "moves": ["d1d5"],
            "goal": CAPTURE_KNIGHT,
            "mode": "goal_search",
        },
    )
    assert response.status_code == 409
    assert "Captured the knight" in response.json()["detail"]


def test_manual_mode_is_rejected(client):
    response = client.post(
        "/api/engine/move", json={"start_fen": QUEEN_VS_KNIGHT, "mode": "manual"}
    )
    assert response.status_code == 422


def test_stockfish_on_kingless_position_is_rejected(client):
    response = client.post(
        "/api/engine/move", json={"start_fen": QUEEN_VS_KNIGHT, "mode": "stockfish"}
    )
    assert response.status_code == 422


def test_illegal_history_is_rejected(client):
    response = client.post(
        "/api/engine/move",
        json={"start_fen": QUEEN_VS_KNIGHT, "moves": ["d1h8"], "mode": "goal_search"},
    )
    assert response.status_code == 422
    assert "Move 1" in response.json()["detail"]


def test_think_time_bounds(client):
    response = client.post(
        "/api/engine/move",
        json={"start_fen": QUEEN_VS_KNIGHT, "mode": "goal_search", "think_ms": 10},
    )
    assert response.status_code == 422


def test_status(client):
    body = client.get("/api/engine/status").json()
    assert body["stockfish_available"] == (stockfish_path() is not None)
    close_stockfish()


def test_scenario_opponent_mode_round_trip(client):
    response = client.post(
        "/api/scenarios",
        json={"title": "Q vs N", "start_fen": QUEEN_VS_KNIGHT, "opponent_mode": "goal_search"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["opponent_mode"] == "goal_search"
