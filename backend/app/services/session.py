from __future__ import annotations

from uuid import uuid4

from app.analysis.coupling import build_execution_exploration_links
from app.models.session import (
    AgentActionDecision,
    AgentSession,
    AgentSessionStartRequest,
    CandidatePatchRequest,
    PatchDecision,
)
from app.models.trace import AgentEvent, AgentEventType
from app.services.verification import validate_patch_scope


class AgentSessionStore:
    """In-memory MVP runtime for visualization-controlled coding-agent sessions.

    The store is deliberately provider-neutral. Codex, Claude Code, or another
    coding agent only needs an adapter that proposes observable actions and
    candidate patch metadata through this interface.
    """

    def __init__(self) -> None:
        self._sessions: dict[str, AgentSession] = {}

    def create(self, request: AgentSessionStartRequest) -> AgentSession:
        session_id = f"agent-{uuid4().hex[:12]}"
        session = AgentSession(
            id=session_id,
            provider=request.provider,
            source_session_id=request.trace.session_id,
            scope=request.scope,
            program_nodes=request.trace.program_nodes,
            agent_events=list(request.trace.agent_events),
            links=list(request.trace.links),
        )
        self._sessions[session_id] = session
        return session

    def get(self, session_id: str) -> AgentSession:
        try:
            return self._sessions[session_id]
        except KeyError as exc:
            raise ValueError(f"Unknown agent session: {session_id}") from exc

    def authorize_and_record_action(self, session_id: str, event: AgentEvent) -> AgentActionDecision:
        session = self.get(session_id)
        decision = authorize_agent_action(event, session)
        session.action_decisions.append(decision)

        if decision.allowed:
            session.agent_events.append(event)
            session.links = build_execution_exploration_links(session.program_nodes, session.agent_events)

        return decision

    def submit_candidate_patch(self, session_id: str, request: CandidatePatchRequest) -> PatchDecision:
        session = self.get(session_id)
        violations = validate_patch_scope(
            request.changed_files,
            request.changed_line_ranges,
            session.scope,
        )
        decision = PatchDecision(
            accepted=not violations,
            changed_files=request.changed_files,
            changed_line_ranges=request.changed_line_ranges,
            scope_violations=violations,
            unified_diff=request.unified_diff,
        )
        session.patch_decisions.append(decision)
        return decision


def authorize_agent_action(event: AgentEvent, session: AgentSession) -> AgentActionDecision:
    """Authorize a proposed observable agent action against visual search scope.

    This is intentionally deterministic. The LLM does not get to reinterpret
    the user's visual scope after the contract has been created.
    """
    scope = session.scope

    if event.type == AgentEventType.run_test:
        allowed = scope.include_tests
        return AgentActionDecision(
            event=event,
            allowed=allowed,
            reason="tests are included in the context contract" if allowed else "tests are disabled by the visual scope",
        )

    if event.type in {AgentEventType.backtrack, AgentEventType.execute} and event.target is None:
        return AgentActionDecision(event=event, allowed=True, reason="control action has no repository target")

    target = event.target
    if target is None:
        return AgentActionDecision(event=event, allowed=True, reason="contextual action has no repository target")

    if target.node_id and target.node_id in scope.search_node_ids:
        return AgentActionDecision(event=event, allowed=True, reason="target node is inside Search Scope")

    if target.file and target.file in scope.search_files:
        return AgentActionDecision(event=event, allowed=True, reason="target file is inside Search Scope")

    if target.file or target.node_id or target.symbol:
        target_label = target.file or target.node_id or target.symbol or "target"
        return AgentActionDecision(
            event=event,
            allowed=False,
            reason=f"{target_label} is outside the visualization-derived Search Scope",
        )

    return AgentActionDecision(event=event, allowed=True, reason="action contains no enforceable repository target")


agent_session_store = AgentSessionStore()
