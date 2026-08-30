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

The demo trace is built from `examples/python-debug-demo/app.py` using:

- AST-based static hierarchy extraction;
- function-level `sys.settrace` runtime evidence.

The example intentionally contains a normalization defect so later milestones can demonstrate localization, scoped editing, and verification.

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
3. an illustrative AI exploration lane;
4. an explicit Exploration–Execution Gap callout;
5. Search / Context / Edit scope previews derived from the selected execution node;
6. a verification placeholder using explicit test counts rather than an undefined score.

## Not Implemented Yet

- real coding-agent event ingestion;
- automatic execution–exploration mapping;
- data-flow extraction;
- actual scoped AI patch execution;
- automatic before/after pytest measurement;
- Monaco source inspector;
- interaction logging for the user study.
