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
