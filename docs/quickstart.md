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

Repository analysis is available at:

```text
POST http://localhost:8000/api/analyze-repository
```

It accepts the in-memory Personal Workspace files and returns a source-grounded
module/symbol/import/call graph. See [`archify-integration.md`](archify-integration.md)
for the model, supported languages, attribution, and current boundaries.

The demo trace is built from `examples/python-debug-demo/` using:

- AST-based static hierarchy extraction from `app.py`;
- intraprocedural AST def-use extraction for the Dataflow disclosure level;
- function-level `sys.settrace` runtime evidence;
- observable coding-agent actions from `agent_trace.json`;
- automatic execution–exploration correspondence by node/file/symbol evidence.

The example intentionally contains a normalization defect so the prototype has a stable target for localization, scoped editing, and verification. `app_fixed.py` contains a one-line corrected implementation used only to exercise the verification pipeline.

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

The response is a `ScopeContract` containing:

- `search_node_ids` and `search_files`;
- `context_node_ids` plus runtime/test inclusion flags;
- `edit_files` and exact `edit_line_ranges`.

The active disclosure level controls granularity. Selecting a Function creates a function-range edit boundary; Dataflow and Statement selections can narrow it to the corresponding computation/source range.

### Patch Guard API

Before applying an agent patch, its changed files and line ranges can be checked against the current visual `ScopeContract`:

```text
POST http://localhost:8000/api/validate-patch
```

Example:

```json
{
  "scope": {
    "selected_node_id": "statement:app.py:20",
    "edit_files": ["app.py"],
    "edit_line_ranges": [{"file": "app.py", "start": 20, "end": 20}]
  },
  "changed_files": ["app.py"],
  "changed_line_ranges": [{"file": "app.py", "start": 20, "end": 20}]
}
```

The response reports `scope_compliant` and explicit violations. This check is intended to run **before patch application**, so a coding-agent adapter can reject edits outside the user-selected visual scope.

### Execution-aware verification

The demo verification endpoint is:

```text
GET http://localhost:8000/api/demo-verification?selected_node_id=<program-node-id>
```

It performs real evidence collection:

1. runs the original implementation with pytest;
2. runs the corrected implementation with pytest;
3. computes a unified code diff and changed line ranges;
4. re-executes both programs and compares function outputs;
5. validates the patch against the selected visual scope.

For the current demo the expected evidence is `0/2 → 2/2 tests passed`, with the source change restricted to the normalization return expression.

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

The frontend loads the trace and verification evidence from `http://localhost:8000` by default.

To use another backend:

```bash
VITE_API_BASE=http://localhost:9000 npm run dev
```

## Current MVP Behavior

The current UI supports:

1. progressive disclosure across Behavior / Logic / Function / Dataflow / Statement;
2. real AST-derived Dataflow nodes and def-use links;
3. a program execution lane grounded in runtime trace data;
4. an AI exploration lane grounded in observable agent events;
5. automatic event-to-program mapping using file/symbol evidence;
6. visual distinction among `runtime-linked`, `gap`, and `context` exploration events;
7. bidirectional coupled brushing between agent exploration and program execution;
8. an explicit Exploration–Execution Gap callout;
9. backend-generated Search / Context / Edit `ScopeContract`s from the active visual disclosure node;
10. scope granularity that follows the selected Function / Dataflow / Statement level;
11. real before/after pytest evidence;
12. runtime function-output comparison;
13. source diff and changed-line evidence;
14. edit-scope compliance / violation reporting;
15. a pre-apply Patch Guard API for coding-agent integration.
16. an Archify-derived repository graph for Python and JavaScript/TypeScript;
17. Repository map search, hierarchy drill-down, source navigation,
    upstream/downstream reach, and directed route tracing inside PipeWorld.

## Not Implemented Yet

- direct adapters for Codex / Claude Code / other live agents;
- execution of a real coding agent under the generated ScopeContract;
- path-sensitive / interprocedural data-flow analysis;
- full tree-sitter or TypeScript-compiler parsing and cross-file symbol typing;
- architecture graph delta/receipt export and revision-verified source links;
- Monaco source inspector;
- persistent sessions / trace database;
- interaction logging for the user study.
