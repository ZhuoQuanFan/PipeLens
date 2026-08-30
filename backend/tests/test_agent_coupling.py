from app.analysis.coupling import build_execution_exploration_links, linked_runtime_status
from app.models.trace import DisclosureLevel, ProgramNode, RuntimeEvidence
from app.tracing.agent import normalize_agent_events


def test_agent_events_are_sorted_and_mapped_to_functions():
    events = normalize_agent_events(
        [
            {
                "id": "late",
                "timestamp": 2.0,
                "type": "inspect_function",
                "target": {"file": "app.py", "symbol": "normalize"},
            },
            {
                "id": "early",
                "timestamp": 1.0,
                "type": "open_file",
                "target": {"file": "app.py"},
            },
        ]
    )

    assert [event.id for event in events] == ["early", "late"]

    nodes = [
        ProgramNode(
            id="behavior:app.py",
            label="app",
            level=DisclosureLevel.behavior,
            file="app.py",
        ),
        ProgramNode(
            id="function:app.py:normalize:1",
            label="normalize()",
            level=DisclosureLevel.function,
            file="app.py",
            start_line=1,
            end_line=4,
            runtime=RuntimeEvidence(executed=True),
        ),
    ]

    links = build_execution_exploration_links(nodes, events)

    exact = next(link for link in links if link.agent_event_id == "late")
    assert exact.execution_node_id == "function:app.py:normalize:1"
    assert exact.relation.value == "exact"
    assert linked_runtime_status(nodes, links)["late"] is True


def test_unmapped_test_event_represents_exploration_gap():
    events = normalize_agent_events(
        [
            {
                "id": "test-file",
                "timestamp": 1.0,
                "type": "open_file",
                "target": {"file": "test_app.py"},
            }
        ]
    )
    nodes = [
        ProgramNode(
            id="behavior:app.py",
            label="app",
            level=DisclosureLevel.behavior,
            file="app.py",
        )
    ]

    assert build_execution_exploration_links(nodes, events) == []
