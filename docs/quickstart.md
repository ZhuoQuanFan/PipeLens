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
- function-level `sys.settrace` runtime evidence;
- observable coding-agent actions from `agent_trace.json`;
- automatic execution–exploration correspondence by node/file/symbol evidence.

The example intentionally contains a normalization defect so later milestones can demonstrate localization, scoped editing, and verification.

### Generic agent coupling API

External coding-agent integrations can send observable events to the generic coupling endpoint:

```text
POST http://localhost:8000/api/couple
```

See `docs/agent-trace-format.md` for the event schema and mapping rules.

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

1. semantic switching across Behavior / Logic / Function / Dataflow / Statement;
2. a program execution lane grounded in runtime trace data;
3. an AI exploration lane grounded in observable agent events;
4. automatic event-to-program mapping using file/symbol evidence;
5. visual distinction among `runtime-linked`, `gap`, and `context` exploration events;
6. an explicit Exploration–Execution Gap callout;
7. Search / Context / Edit scope previews derived from the selected execution node;
8. a working scope-lock interaction that turns the current selection into a proposed agent boundary;
9. a verification placeholder using explicit test counts rather than an undefined score.

## Not Implemented Yet

- direct adapters for Codex / Claude Code / other live agents;
- data-flow extraction below statement/function structure;
- actual scoped AI patch execution;
- automatic before/after pytest measurement;
- Monaco source inspector;
- persistent sessions / trace database;
- interaction logging for the user study.
