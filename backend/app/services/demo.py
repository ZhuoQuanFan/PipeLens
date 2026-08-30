from __future__ import annotations

import importlib.util
from pathlib import Path

from app.analysis.coupling import build_execution_exploration_links
from app.analysis.python_ast import PythonHierarchyAnalyzer
from app.models.trace import TraceBundle
from app.tracing.agent import load_agent_events
from app.tracing.runtime import RuntimeTracer


def _load_demo_module(app_path: Path):
    spec = importlib.util.spec_from_file_location("pipelens_demo_app", app_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load demo module from {app_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build_demo_trace() -> TraceBundle:
    repository_root = Path(__file__).resolve().parents[3]
    demo_root = repository_root / "examples" / "python-debug-demo"
    app_path = demo_root / "app.py"
    agent_trace_path = demo_root / "agent_trace.json"

    analyzer = PythonHierarchyAnalyzer()
    static_nodes = analyzer.analyze_file(app_path, demo_root)

    module = _load_demo_module(app_path)
    tracer = RuntimeTracer(demo_root)
    tracer.run(module.run_pipeline, [10.0, 20.0, 30.0])

    runtime_nodes = tracer.as_nodes()
    runtime_by_label = {f"{node.label}()": node for node in runtime_nodes}

    for node in static_nodes:
        if node.level.value != "function":
            continue
        runtime = runtime_by_label.get(node.label)
        if runtime is None:
            continue
        node.runtime = runtime.runtime

    agent_events = load_agent_events(agent_trace_path)
    links = build_execution_exploration_links(static_nodes, agent_events)

    return TraceBundle(
        session_id="python-debug-demo",
        program_nodes=static_nodes,
        agent_events=agent_events,
        links=links,
    )
