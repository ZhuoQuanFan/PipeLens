from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.analysis.coupling import build_execution_exploration_links
from app.models.trace import CouplingRequest, TraceBundle
from app.services.demo import build_demo_trace

app = FastAPI(title="PipeLens API", version="0.2.0")

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
    """Couple external coding-agent events with a program trace.

    Coding-agent integrations only need to emit the observable AgentEvent
    schema. PipeLens owns the mapping step so the visualization does not depend
    on a specific agent framework.
    """

    links = build_execution_exploration_links(request.program_nodes, request.agent_events)
    return TraceBundle(
        session_id=request.session_id,
        program_nodes=request.program_nodes,
        agent_events=request.agent_events,
        links=links,
    )
