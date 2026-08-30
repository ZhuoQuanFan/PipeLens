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


def test_demo_verification_endpoint_returns_real_before_after_evidence():
    trace = client.get("/api/demo-trace").json()
    normalize = next(
        node for node in trace["program_nodes"]
        if node["level"] == "function" and node["label"] == "normalize()"
    )

    response = client.get(
        "/api/demo-verification",
        params={"selected_node_id": normalize["id"]},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["before_tests"]["failed"] == 2
    assert payload["after_tests"]["passed"] == 2
    assert payload["improved"] is True
    assert payload["scope_compliant"] is True
    assert payload["changed_line_ranges"] == [{"file": "app.py", "start": 20, "end": 20}]
