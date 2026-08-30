from app.services.demo import build_demo_trace


def test_demo_trace_contains_runtime_agent_events_and_links():
    bundle = build_demo_trace()

    assert bundle.session_id == "python-debug-demo"
    assert any(node.level.value == "function" and node.runtime.executed for node in bundle.program_nodes)
    assert len(bundle.agent_events) >= 8
    assert any(event.type.value == "backtrack" for event in bundle.agent_events)
    assert any(event.type.value == "patch" for event in bundle.agent_events)
    assert any(link.relation.value == "exact" for link in bundle.links)

    normalize_links = [
        link
        for link in bundle.links
        if next(event for event in bundle.agent_events if event.id == link.agent_event_id).target
        and next(event for event in bundle.agent_events if event.id == link.agent_event_id).target.symbol == "normalize"
    ]
    assert normalize_links
