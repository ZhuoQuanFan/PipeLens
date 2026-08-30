from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def _create_session():
    trace = client.get("/api/demo-trace").json()
    normalize = next(
        node for node in trace["program_nodes"]
        if node["level"] == "function" and node["label"] == "normalize()"
    )
    scope_response = client.post(
        "/api/scope",
        json={"selected_node_id": normalize["id"], "program_nodes": trace["program_nodes"]},
    )
    assert scope_response.status_code == 200

    response = client.post(
        "/api/agent-sessions",
        json={"trace": trace, "scope": scope_response.json(), "provider": "test-provider"},
    )
    assert response.status_code == 200
    return response.json()


def test_agent_session_api_authorizes_and_rejects_actions():
    session = _create_session()
    session_id = session["id"]

    allowed = client.post(
        f"/api/agent-sessions/{session_id}/actions",
        json={
            "event": {
                "id": "api-live-1",
                "timestamp": 100.0,
                "type": "inspect_function",
                "target": {"file": "app.py", "symbol": "normalize"},
                "tool": "symbol_lookup",
            }
        },
    )
    rejected = client.post(
        f"/api/agent-sessions/{session_id}/actions",
        json={
            "event": {
                "id": "api-live-2",
                "timestamp": 101.0,
                "type": "open_file",
                "target": {"file": "unrelated.py"},
                "tool": "open_file",
            }
        },
    )

    assert allowed.status_code == 200
    assert allowed.json()["allowed"] is True
    assert rejected.status_code == 200
    assert rejected.json()["allowed"] is False

    state = client.get(f"/api/agent-sessions/{session_id}")
    assert state.status_code == 200
    payload = state.json()
    assert payload["rejected_actions"] == 1
    assert any(event["id"] == "api-live-1" for event in payload["agent_events"])
    assert all(event["id"] != "api-live-2" for event in payload["agent_events"])


def test_agent_session_api_guards_candidate_patch():
    session = _create_session()
    session_id = session["id"]

    accepted = client.post(
        f"/api/agent-sessions/{session_id}/candidate-patch",
        json={
            "changed_files": ["app.py"],
            "changed_line_ranges": [{"file": "app.py", "start": 20, "end": 20}],
        },
    )
    rejected = client.post(
        f"/api/agent-sessions/{session_id}/candidate-patch",
        json={
            "changed_files": ["app.py"],
            "changed_line_ranges": [{"file": "app.py", "start": 3, "end": 3}],
        },
    )

    assert accepted.status_code == 200
    assert accepted.json()["accepted"] is True
    assert rejected.status_code == 200
    assert rejected.json()["accepted"] is False
    assert rejected.json()["scope_violations"]
