from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models.trace import TraceBundle
from app.services.demo import build_demo_trace

app = FastAPI(title="PipeLens API", version="0.1.0")

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
