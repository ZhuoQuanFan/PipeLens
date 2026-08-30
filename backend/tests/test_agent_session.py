from app.models.session import AgentSessionStartRequest, CandidatePatchRequest
from app.models.trace import AgentEvent, AgentEventType, AgentTarget, LineRange
from app.services.demo import build_demo_trace
from app.services.scope import build_scope_contract
from app.services.session import AgentSessionStore


def _normalize_session():
    trace = build_demo_trace()
    normalize = next(
        node for node in trace.program_nodes
        if node.level.value == "function" and node.label == "normalize()"
    )
    scope = build_scope_contract(trace.program_nodes, normalize.id)
    store = AgentSessionStore()
    session = store.create(AgentSessionStartRequest(trace=trace, scope=scope, provider="test-agent"))
    return store, session


def test_agent_session_authorizes_actions_inside_search_scope():
    store, session = _normalize_session()
    event = AgentEvent(
        id="live-1",
        timestamp=100.0,
        type=AgentEventType.inspect_function,
        target=AgentTarget(file="app.py", symbol="normalize"),
        tool="symbol_lookup",
    )

    decision = store.authorize_and_record_action(session.id, event)
    updated = store.get(session.id)

    assert decision.allowed is True
    assert updated.agent_events[-1].id == "live-1"
    assert any(link.agent_event_id == "live-1" for link in updated.links)
    assert updated.rejected_actions == 0


def test_agent_session_rejects_repository_action_outside_search_scope():
    store, session = _normalize_session()
    event = AgentEvent(
        id="live-2",
        timestamp=101.0,
        type=AgentEventType.open_file,
        target=AgentTarget(file="unrelated.py"),
        tool="open_file",
    )

    decision = store.authorize_and_record_action(session.id, event)
    updated = store.get(session.id)

    assert decision.allowed is False
    assert all(item.id != "live-2" for item in updated.agent_events)
    assert updated.rejected_actions == 1


def test_agent_session_allows_tests_when_scope_includes_tests():
    store, session = _normalize_session()
    event = AgentEvent(
        id="live-test",
        timestamp=102.0,
        type=AgentEventType.run_test,
        target=AgentTarget(file="test_app.py"),
        tool="pytest",
    )

    decision = store.authorize_and_record_action(session.id, event)

    assert decision.allowed is True


def test_agent_session_patch_guard_accepts_only_edit_scope():
    store, session = _normalize_session()

    accepted = store.submit_candidate_patch(
        session.id,
        CandidatePatchRequest(
            changed_files=["app.py"],
            changed_line_ranges=[LineRange(file="app.py", start=20, end=20)],
        ),
    )
    rejected = store.submit_candidate_patch(
        session.id,
        CandidatePatchRequest(
            changed_files=["app.py", "unrelated.py"],
            changed_line_ranges=[
                LineRange(file="app.py", start=20, end=22),
                LineRange(file="unrelated.py", start=1, end=1),
            ],
        ),
    )

    updated = store.get(session.id)
    assert accepted.accepted is True
    assert rejected.accepted is False
    assert len(rejected.scope_violations) == 2
    assert updated.rejected_patches == 1
