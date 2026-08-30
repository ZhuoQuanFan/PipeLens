from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.analysis.coupling import build_execution_exploration_links
from app.analysis.python_structure import PythonStructureAnalyzer
from app.models.session import (
    AgentActionDecision,
    AgentActionRequest,
    AgentSession,
    AgentSessionStartRequest,
    CandidatePatchRequest,
    PatchDecision,
)
from app.models.structure import AnalyzePythonRequest, PythonStructureResponse
from app.models.trace import CouplingRequest, ScopeContract, ScopeRequest, TraceBundle
from app.models.verification import PatchScopeRequest, PatchScopeResult, VerificationReport
from app.services.demo import build_demo_trace
from app.services.scope import build_scope_contract
from app.services.session import agent_session_store
from app.services.verification import build_demo_verification, validate_patch_scope

app = FastAPI(title="PipeLens API", version="0.7.0")
python_structure_analyzer = PythonStructureAnalyzer()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/analyze-python-structure", response_model=PythonStructureResponse)
def analyze_python_structure(request: AnalyzePythonRequest) -> PythonStructureResponse:
    """Extract module/class/function/statement hierarchy for pipe visualization."""
    try:
        return python_structure_analyzer.analyze_source(request.source, request.file)
    except SyntaxError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid Python source: {exc.msg}") from exc


@app.get("/api/demo-trace", response_model=TraceBundle)
def demo_trace() -> TraceBundle:
    return build_demo_trace()


@app.post("/api/couple", response_model=TraceBundle)
def couple_trace(request: CouplingRequest) -> TraceBundle:
    """Couple external coding-agent events with a program trace."""
    links = build_execution_exploration_links(request.program_nodes, request.agent_events)
    return TraceBundle(
        session_id=request.session_id,
        program_nodes=request.program_nodes,
        agent_events=request.agent_events,
        links=links,
    )


@app.post("/api/scope", response_model=ScopeContract)
def generate_scope(request: ScopeRequest) -> ScopeContract:
    """Translate a visual program selection into search/context/edit bounds."""
    try:
        return build_scope_contract(request.program_nodes, request.selected_node_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/validate-patch", response_model=PatchScopeResult)
def validate_patch(request: PatchScopeRequest) -> PatchScopeResult:
    """Reject candidate edits that exceed a visualization-derived edit scope."""
    return PatchScopeResult(
        scope_violations=validate_patch_scope(
            request.changed_files,
            request.changed_line_ranges,
            request.scope,
        )
    )


@app.post("/api/agent-sessions", response_model=AgentSession)
def create_agent_session(request: AgentSessionStartRequest) -> AgentSession:
    """Create a provider-neutral coding-agent session bound to a visual scope."""
    return agent_session_store.create(request)


@app.get("/api/agent-sessions/{session_id}", response_model=AgentSession)
def get_agent_session(session_id: str) -> AgentSession:
    try:
        return agent_session_store.get(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/agent-sessions/{session_id}/actions", response_model=AgentActionDecision)
def authorize_agent_action(session_id: str, request: AgentActionRequest) -> AgentActionDecision:
    """Authorize a proposed observable agent action against Search Scope."""
    try:
        return agent_session_store.authorize_and_record_action(session_id, request.event)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/agent-sessions/{session_id}/candidate-patch", response_model=PatchDecision)
def submit_candidate_patch(session_id: str, request: CandidatePatchRequest) -> PatchDecision:
    """Authorize a candidate patch against Edit Scope before application."""
    try:
        return agent_session_store.submit_candidate_patch(session_id, request)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/demo-verification", response_model=VerificationReport)
def demo_verification(selected_node_id: str) -> VerificationReport:
    """Run before/after pytest, runtime diff, and scope-compliance checks."""
    try:
        return build_demo_verification(selected_node_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
