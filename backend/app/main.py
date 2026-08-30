from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.analysis.coupling import build_execution_exploration_links
from app.models.trace import CouplingRequest, ScopeContract, ScopeRequest, TraceBundle
from app.services.demo import build_demo_trace
from app.services.scope import build_scope_contract

app = FastAPI(title="PipeLens API", version="0.3.0")

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
