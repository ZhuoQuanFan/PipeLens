# Archify integration

PipeLens keeps its 2D water-pipe world, progressive disclosure, runtime replay,
fault blocking, and code-edit workflow. Archify-derived capabilities enter as a
separate **Repository map** mode that feeds the same `PipeNode` renderer.

## Sources evaluated

Two public projects named Archify were relevant when this integration was
implemented (2026-09-04):

1. [Aryan1718/Archify](https://github.com/Aryan1718/Archify), pinned during the
   review at commit `2e711ee34587bd7942261467251a9bbe0be59521`. Its Python
   engine extracts file/symbol/import/call graph fragments, associates source
   locations and confidence, and merges them into a deterministic graph. The
   package metadata declares the project MIT licensed.
2. [tt-a1i/archify](https://github.com/tt-a1i/archify), reviewed at stable
   version `v2.13.0`. It provides a typed JSON diagram IR, schema validation,
   repository-revision/source evidence, search, focus, upstream/downstream
   reach, directed route probing, guided views, deterministic layout checks,
   and a standalone interactive viewer. It is MIT licensed.

The first project supplied the closest extraction architecture. The second
supplied the stronger graph/viewer contract and navigation semantics. The
standalone Archify renderer was deliberately not embedded because doing so
would create a second visual language beside PipeWorld.

## What was integrated

### Source-grounded repository graph

`POST /api/analyze-repository` accepts the files already loaded in the
browser's personal workspace. It does not read arbitrary server paths. The
analyzer currently supports Python and JavaScript/TypeScript source files and
emits:

- repository, module, class, function, method, and external dependency nodes;
- containment, import, and call relationships;
- stable IDs, explicit relationship confidence, and source file/line anchors;
- partial results plus parse warnings when one file cannot be analyzed;
- summary counts used by the UI.

Python structure and calls use the standard-library AST. JavaScript and
TypeScript use a conservative deterministic extractor for declarations,
imports, and common call forms. Local import resolution supports Python module
paths, relative Python imports, JS/TS extensions, and `index.*` modules.

The FastAPI implementation serves local development. The Vercel deployment
uses a standard-library-only Python function with the same response contract,
so uploaded workspace contents remain request-scoped and are not persisted by
the repository analyzer.

### PipeWorld adapter and navigation

The frontend converts the repository graph to the existing PipeLens
`PipeNode` hierarchy:

| Repository graph | PipeLens visual grammar |
| --- | --- |
| repository | behavior / machine |
| module or class | logic / machine or splitter |
| function or method | function / valve |
| external dependency | logic / machine |
| source anchor | existing source inspector highlight |
| containment | click-to-enter progressive disclosure |
| imports and calls | upstream/downstream reach and directed routes |

The Repository map adds local search, hierarchy drill-down, exact source
location, upstream reach, downstream reach, and shortest directed route views.
Each resulting view still flows through the original animated pipe renderer.

## Run

Use Python 3.11+ and Node.js 20.19+.

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -e '.[dev]'
pytest
uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```bash
cd frontend
npm install
npm test
npm run dev
```

Open `http://localhost:5173`. Wait for the repository summary to appear, then
choose **Repository map**. Uploading a source directory through the existing
Personal Workspace control automatically refreshes its repository graph.

## Current boundaries and next-stage candidates

- Replace the conservative JS/TS extractor with tree-sitter or the TypeScript
  compiler API, retaining the same graph contract.
- Add cross-file Python name resolution for re-exports, wildcard imports,
  inheritance, decorators, and dynamic imports.
- Add path-sensitive interprocedural data flow and control-flow branches.
- Port Archify's repository revision verification and source-hash receipts.
- Add graph-delta comparison for before/after architecture changes.
- Add semantic roles/lenses, named guided stories, overview radar, and export
  receipts once they can be expressed in PipeLens' pipe grammar.
- Move breadth-first graph queries to the backend for very large repositories
  and add incremental/cached analysis keyed by workspace content hashes.
