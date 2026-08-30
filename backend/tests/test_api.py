from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_couple_endpoint_maps_agent_event_to_program_node():
    response = client.post(
        "/api/couple",
        json={
            "session_id": "api-test",
            "program_nodes": [
                {
                    "id": "function:app.py:normalize:1",
                    "label": "normalize()",
                    "level": "function",
                    "file": "app.py",
                    "runtime": {"executed": True},
                }
            ],
            "agent_events": [
                {
                    "id": "evt-1",
                    "timestamp": 1.0,
                    "type": "inspect_function",
                    "target": {"file": "app.py", "symbol": "normalize"},
                }
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["session_id"] == "api-test"
    assert payload["links"][0]["execution_node_id"] == "function:app.py:normalize:1"
    assert payload["links"][0]["relation"] == "exact"


def test_scope_endpoint_returns_explicit_edit_boundary():
    node = {
        "id": "function:app.py:normalize:7",
        "label": "normalize()",
        "level": "function",
        "file": "app.py",
        "start_line": 7,
        "end_line": 20,
        "runtime": {"executed": True},
    }
    response = client.post(
        "/api/scope",
        json={"selected_node_id": node["id"], "program_nodes": [node]},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["selected_node_id"] == node["id"]
    assert payload["edit_files"] == ["app.py"]
    assert payload["edit_line_ranges"] == [{"file": "app.py", "start": 7, "end": 20}]


def test_scope_endpoint_rejects_unknown_node():
    response = client.post(
        "/api/scope",
        json={"selected_node_id": "missing", "program_nodes": []},
    )

    assert response.status_code == 404
