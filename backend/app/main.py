from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.analysis.coupling import build_execution_exploration_links
from app.models.trace import CouplingRequest, ScopeContract, ScopeRequest, TraceBundle
from app.models.verification import PatchScopeRequest, PatchScopeResult, VerificationReport
from app.services.demo import build_demo_trace
from app.services.scope import build_scope_contract
from app.services.verification import build_demo_verification, validate_patch_scope

app = FastAPI(title="PipeLens API", version="0.5.0")

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


@app.get("/api/demo-verification", response_model=VerificationReport)
def demo_verification(selected_node_id: str) -> VerificationReport:
    """Run before/after pytest, runtime diff, and scope-compliance checks."""
    try:
        return build_demo_verification(selected_node_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
