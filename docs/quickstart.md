# PipeLens MVP Quickstart

## Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e '.[dev]'
pytest
uvicorn app.main:app --reload --port 8000
```

Check:

```text
http://localhost:8000/health
http://localhost:8000/api/demo-trace
```

The demo trace is built from `examples/python-debug-demo/` using:

- AST-based static hierarchy extraction from `app.py`;
- intraprocedural AST def-use extraction for the Dataflow disclosure level;
- function-level `sys.settrace` runtime evidence;
- observable coding-agent actions from `agent_trace.json`;
- automatic execution–exploration correspondence by node/file/symbol evidence.

The example intentionally contains a normalization defect so the prototype has a stable target for localization, scoped editing, and verification.

### Dataflow semantics

For assignments and returns, PipeLens records explicit data inputs, outputs, the source expression, and lightweight def-use edges. For the demo, this yields relations such as:

```text
values → min(values) → minimum
values → max(values) → maximum
maximum, minimum → maximum - minimum → span
span, values → [v / span for v in values] → return
```

This is a syntactic, intraprocedural approximation. It is not yet a path-sensitive control/data-flow analysis.

### Generic agent coupling API

External coding-agent integrations can send observable events to:

```text
POST http://localhost:8000/api/couple
```

See `docs/agent-trace-format.md` for the event schema and mapping rules.

### Visualization-as-Control API

A visual selection can be converted into a machine-readable agent boundary with:

```text
POST http://localhost:8000/api/scope
```

Request:

```json
{
  "selected_node_id": "dataflow:app.py:normalize:20:4",
  "program_nodes": []
}
```

The real request sends the current `program_nodes` array. The response is a `ScopeContract` containing:

- `search_node_ids` and `search_files`;
- `context_node_ids` plus runtime/test inclusion flags;
- `edit_files` and exact `edit_line_ranges`.

The active disclosure level controls granularity. Selecting a Function creates a function-range edit boundary; Dataflow and Statement selections can narrow it to the corresponding computation/source range.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

The frontend loads `/api/demo-trace` from `http://localhost:8000` by default.

To use another backend:

```bash
VITE_API_BASE=http://localhost:9000 npm run dev
```

## Current MVP Behavior

The current UI supports:

1. progressive disclosure across Behavior / Logic / Function / Dataflow / Statement;
2. real AST-derived Dataflow nodes and def-use links instead of a placeholder Dataflow layer;
3. a program execution lane grounded in runtime trace data;
4. an AI exploration lane grounded in observable agent events;
5. automatic event-to-program mapping using file/symbol evidence;
6. visual distinction among `runtime-linked`, `gap`, and `context` exploration events;
7. bidirectional coupled brushing between agent exploration and program execution;
8. an explicit Exploration–Execution Gap callout;
9. backend-generated Search / Context / Edit `ScopeContract`s from the active visual disclosure node;
10. scope granularity that follows the selected Function / Dataflow / Statement level;
11. a verification placeholder using explicit test counts rather than an undefined score.

## Not Implemented Yet

- direct adapters for Codex / Claude Code / other live agents;
- path-sensitive / interprocedural data-flow analysis;
- execution of a real coding agent under the generated ScopeContract;
- automatic before/after pytest measurement;
- Monaco source inspector;
- persistent sessions / trace database;
- interaction logging for the user study.
