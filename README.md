# PipeLens

**Progressive White-Box Visual Analytics for Understanding and Steering AI Coding Agents**

PipeLens is a visual analytics system for understanding, steering, and verifying AI coding agents.

Instead of treating AI-generated or AI-modified code as a flat collection of files, tool logs, and patches, PipeLens progressively exposes the **program computation** from high-level behavior to concrete code, while coupling it with the **agent's observable repository exploration process**.

> **Core idea**  
> Make both *what the program actually did* and *where the AI looked* visible, then use visual selection as a control primitive for the agent's next search, context acquisition, and edit.

The runnable prototype now also includes an **Archify-derived Repository map**:
Python and JavaScript/TypeScript workspaces are converted into a source-grounded
module/symbol/import/call graph, then adapted to the existing PipeWorld visual
grammar for search, drill-down, upstream/downstream reach, directed routes, and
code-line navigation. See [`docs/archify-integration.md`](docs/archify-integration.md)
for sources, attribution, architecture, and limitations.

---

## 1. Research Motivation

Modern coding agents can autonomously search repositories, inspect files, call tools, edit code, and run tests. However, two forms of opacity remain.

### 1.1 Program opacity

Source code is technically visible, but developers may still struggle to understand how a high-level behavior is realized across modules, functions, data flows, and statements.

For example, an unfamiliar AI-generated implementation may initially appear only as:

```text
A ───────────────────→ B
```

while the actual computation is progressively revealed as:

```text
Behavior
A ───────────────────→ B

Logic
A ── normalize ──────→ B

Function
normalize(x)

Dataflow
x ── transform ──────→ y

Statement
y = (x - min(x)) / max(eps, max(x) - min(x))
```

### 1.2 Agent exploration opacity

Coding agents may search many files, follow dependencies, backtrack, run tests, and inspect candidate regions before making a patch. These observable actions are usually shown as long tool-call logs rather than a coherent visual process.

PipeLens treats this exploration process as a first-class visual object.

> **Important terminology:**  
> “White-box” in PipeLens refers to the **program computation becoming progressively inspectable**. It does **not** refer to revealing hidden model chain-of-thought or internal neural reasoning.

---

## 2. Core Visual Analytics Paradigm

PipeLens is organized around three coupled mechanisms:

1. **Progressive Computational Disclosure**
2. **Execution–Exploration Coupling**
3. **Visualization-as-Control**

Together they form the interaction loop:

```text
Understand → Explore → Steer → Edit → Verify
                ↑                  │
                └──────────────────┘
```

---

## 3. Progressive Computational Disclosure

PipeLens represents the same computation at multiple semantic levels:

```text
Behavior
   ↓
Logic
   ↓
Function
   ↓
Dataflow
   ↓
Statement
```

These are not independent views. They are **linked representations of the same computation**.

### Example

```text
Level 0 — Behavior
A ───────────────────→ B

Level 1 — Logic
A ── normalize ──────→ B

Level 2 — Function
normalize(x)

Level 3 — Dataflow
x ── normalize ──────→ y

Level 4 — Statement
y = (x - min(x)) / max(eps, max(x) - min(x))
```

### Required interactions

- click to expand a semantic unit;
- collapse to its parent abstraction;
- breadcrumb navigation across levels;
- highlight parent–child correspondence;
- preserve spatial context where possible;
- reveal runtime values on demand;
- allow a selected abstraction to become an AI search/edit scope.

The design goal is **semantic zoom**, not merely geometric zoom.

---

## 4. Execution–Exploration Coupling

PipeLens visualizes two different but related spaces.

### 4.1 Program Execution Space

Represents what the program actually executed.

```text
Input
  ↓
preprocess(x)
  ↓
normalize(x)
  ↓
score(x)
  ↓
Output
```

This space is grounded in runtime evidence such as function calls, return values, exceptions, tests, and selected variable snapshots.

### 4.2 AI Exploration Space

Represents where the coding agent actually looked.

```text
Repository
  ↓
src/
  ↓
ranking.py
  ↓
rerank(x)
  ↓
tests/
```

Observable actions include:

- repository search;
- grep / symbol lookup;
- file open;
- function inspection;
- dependency traversal;
- test execution;
- backtracking;
- patch generation;
- patch application;
- re-execution.

PipeLens does **not** require hidden chain-of-thought.

### 4.3 Exploration–Execution Gap

PipeLens maps the two spaces when they refer to the same computation.

A central diagnostic signal is the **Exploration–Execution Gap**:

> the mismatch between runtime evidence indicating where the relevant computation occurred and agent exploration indicating where the AI is currently searching.

Example:

```text
PROGRAM EXECUTION              AI EXPLORATION

normalize(x)  ●                 rerank(x)  ●
      │                            │
      └──── exploration gap ───────┘
```

A useful system should make this mismatch immediately visible rather than requiring users to reconstruct it from raw tool logs.

---

## 5. Visualization-as-Control

Visual selection is not only used to inspect details. A selected visual region becomes a **control primitive** for the coding agent.

For example, selecting `normalize(x)` can define three related scopes.

### 5.1 Search Scope

Where the agent should continue looking.

```text
normalize(x)
├── callers
├── callees
├── related dataflow
└── relevant tests
```

### 5.2 Context Scope

What evidence should be included in the next model context.

```text
- normalize(x)
- callers
- runtime inputs / outputs
- failing tests
- nearby data dependencies
```

### 5.3 Edit Scope

What code the agent is permitted or encouraged to modify.

```text
Allowed:
  normalize(x), lines 121–138

Do not modify:
  callers
  public API
  unrelated files
```

This creates a human–AI loop in which visualization directly influences agent behavior.

---

## 6. Primary User Tasks

### T1. Understand AI-generated code

Developers should be able to understand unfamiliar AI-generated code without manually reading an entire repository.

```text
System → Stage → Logic → Function → Dataflow → Statement
```

### T2. Localize fault-relevant code

Starting from an incorrect output, failed test, runtime exception, or suspicious value, users should be able to progressively narrow the relevant code region.

```text
Wrong Output
    ↑
score()
    ↑
normalize()
    ↑
dataflow
    ↑
statement
```

### T3. Inspect and steer AI exploration

Users should see:

- files searched by the agent;
- symbols inspected;
- functions opened;
- tests executed;
- backtracking;
- candidate regions;
- patch attempts.

The system should make it obvious when agent exploration diverges from runtime evidence.

### T4. Constrain and verify AI editing

Users should be able to select a visual scope, convert it into an AI editing constraint, execute the patch, and verify its effect.

---

## 7. Prototype Design

The initial prototype contains five coordinated views.

### 7.1 Pipeline Overview

Purpose:

- show top-level program behavior;
- summarize execution stages;
- mark suspicious / selected computation;
- act as the main navigation surface.

Example:

```text
Input → Parse → Normalize → Compute → Output
```

Each node can be expanded into a finer semantic level.

### 7.2 Progressive Disclosure View

Supports:

```text
Behavior
  → Logic
    → Function
      → Dataflow
        → Statement
```

The view must preserve correspondence across levels rather than replacing the user's context with an unrelated graph.

### 7.3 Execution–Exploration View

Two coordinated lanes:

```text
PROGRAM EXECUTION
Input → preprocess → normalize → score → Output
                         │
                         │ semantic mapping
                         │
AI EXPLORATION
Repo → src → ranking.py → rerank → tests
```

Required features:

- semantic links between lanes;
- aligned-region encoding;
- explicit mismatch / gap representation;
- agent backtracking visualization;
- runtime fault candidates;
- linked brushing and highlighting.

### 7.4 Evidence Inspector

Selecting a node exposes evidence.

#### Program evidence

- source file;
- line range;
- function / symbol;
- callers and callees;
- runtime inputs;
- runtime outputs;
- exception;
- test result;
- duration.

#### Agent evidence

- search query;
- file-open event;
- symbol lookup;
- test command;
- patch attempt;
- observable tool input/output;
- timestamp;
- duration.

### 7.5 Scope Control Panel

A selected computation can be transformed into:

- **Search Scope**
- **Context Scope**
- **Edit Scope**

Example:

```text
Selected: normalize(x)

[ Focus Search Here ]

Search Scope
✓ normalize(x)
✓ callers
✓ callees
✓ related tests

Context Scope
✓ source
✓ runtime values
✓ failing tests
□ unrelated modules

Edit Scope
● function only
○ logic block
○ statement only
○ file
```

Before the agent runs, the generated scope contract should be visible to the user.

---

## 8. Verification View

After an AI edit, PipeLens compares the old and new executions.

Prefer explicit verification evidence instead of decorative generic scores.

Example:

```text
Before Patch
3 / 20 tests passed
17 failing tests

After Patch
20 / 20 tests passed
0 failing tests
```

Additional metrics may include:

- changed lines;
- changed functions;
- edit-scope violations;
- execution-path differences;
- failing-test count;
- runtime output error;
- task-specific correctness metrics.

---

## 9. Visual Encoding Principles

### 9.1 Stable semantic colors

Recommended categories:

- **Blue** — observed program execution;
- **Teal** — AI exploration;
- **Orange** — suspicious / selected computation;
- **Purple** — user control / scoped AI action;
- **Gray** — neutral / inactive structure.

Do not reuse one color for unrelated meanings.

### 9.2 Accessibility

Important states must use multiple channels.

```text
Aligned
  solid semantic link + link icon

Mismatch
  dashed link + × icon + label

Suspicious
  warning icon + outline / pattern

Selected
  selection border + focus indicator
```

Do not rely on red/green alone.

### 9.3 Academic UI style

The research prototype should prioritize:

- readable text at paper scale;
- flat visual hierarchy;
- restrained shadows;
- minimal gradients;
- strong structural grouping;
- consistent node sizing;
- explicit labels;
- evidence over decoration.

---

## 10. Core Data Model

### ProgramNode

```ts
type ProgramNode = {
  id: string
  parentId?: string
  level: "behavior" | "logic" | "function" | "dataflow" | "statement"
  label: string

  file?: string
  startLine?: number
  endLine?: number

  children: string[]
  incoming: string[]
  outgoing: string[]

  runtime?: {
    executed: boolean
    startTime?: number
    endTime?: number
    inputValues?: Record<string, unknown>
    outputValues?: Record<string, unknown>
    exception?: string
  }
}
```

### AgentEvent

```ts
type AgentEvent = {
  id: string
  timestamp: number

  type:
    | "search"
    | "open_file"
    | "symbol_lookup"
    | "inspect_function"
    | "run_test"
    | "backtrack"
    | "patch"
    | "execute"

  target?: {
    file?: string
    symbol?: string
    nodeId?: string
  }

  tool?: string
  observableInput?: unknown
  observableOutput?: unknown
}
```

### ExecutionExplorationLink

```ts
type ExecutionExplorationLink = {
  executionNodeId: string
  agentEventId: string

  relation:
    | "exact"
    | "ancestor"
    | "dependency"
    | "candidate"

  confidence?: number
}
```

### ScopeContract

```ts
type ScopeContract = {
  selectedNodeId: string

  searchScope: {
    nodeIds: string[]
    files: string[]
  }

  contextScope: {
    nodeIds: string[]
    includeRuntimeValues: boolean
    includeTests: boolean
  }

  editScope: {
    files: string[]
    lineRanges: Array<{
      file: string
      start: number
      end: number
    }>
  }
}
```

---

## 11. Data Collection

The system eventually needs four data sources.

### 11.1 Static Program Structure

Initial Python implementation can use:

- Python AST;
- tree-sitter;
- symbol index;
- call graph;
- control-flow analysis;
- data-flow analysis.

### 11.2 Runtime Execution

Initial instrumentation should capture:

- function calls;
- returns;
- exceptions;
- selected variable snapshots;
- test execution;
- timing.

Possible mechanisms:

- Python `sys.settrace`;
- instrumentation decorators;
- pytest hooks;
- OpenTelemetry spans where useful.

### 11.3 AI Exploration Trace

Record observable coding-agent actions:

```text
search
open file
symbol lookup
dependency traversal
run test
backtrack
patch
execute
```

No hidden chain-of-thought dependency.

### 11.4 Git / Patch Information

Track:

- changed files;
- changed functions;
- changed line ranges;
- before / after diff;
- commit;
- edit-scope violations.

---

## 12. Proposed Architecture

```text
┌─────────────────────────────────────────────────┐
│                 Coding Agent                    │
│ Search / Open / Test / Patch / Execute         │
└──────────────────────┬──────────────────────────┘
                       │ observable actions
                       ▼
┌─────────────────────────────────────────────────┐
│               Agent Trace Adapter               │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
                 ┌───────────┐
                 │ Trace DB  │
                 └─────┬─────┘
                       │
┌──────────────────────┼──────────────────────────┐
│                      │                          │
▼                      ▼                          ▼
Static Analyzer    Runtime Tracer             Git Adapter
AST / symbols      execution / values         diff / patch
│                      │                          │
└──────────────────────┼──────────────────────────┘
                       ▼
            ┌─────────────────────┐
            │ PipeLens Core Model │
            │ hierarchy + mapping │
            └──────────┬──────────┘
                       ▼
            ┌─────────────────────┐
            │ Visualization Layer │
            └──────────┬──────────┘
                       ▼
       Progressive Disclosure / Coupled View
            Evidence / Scope / Verification
```

---

## 13. Technology Plan

### Frontend

- React
- TypeScript
- Vite
- Zustand
- D3.js for custom visual layouts
- Monaco Editor for source-code inspection

### Backend

- Python
- FastAPI
- Pydantic
- NetworkX initially for graph operations
- Python AST / tree-sitter
- pytest integration

### Storage

MVP:

- JSON / JSONL traces

Later, if needed:

- SQLite or DuckDB

Do not introduce a graph database until the interaction model actually requires one.

---

## 14. MVP

The first end-to-end MVP targets **one Python repository and one debugging session**.

Given:

- a Python repository;
- a failing test;
- an agent exploration trace;

PipeLens should:

1. parse the repository;
2. collect function-level runtime execution;
3. visualize the executed pipeline;
4. visualize agent search / inspection events;
5. align exploration events with execution nodes;
6. expose exploration–execution gaps;
7. drill from function to source statement;
8. select a visual node;
9. generate a scope contract;
10. apply or simulate an AI patch;
11. rerun tests;
12. show before / after verification.

---

## 15. Development Milestones

### M0 — Project Skeleton

- [ ] frontend bootstrapping
- [ ] backend bootstrapping
- [ ] shared schema
- [ ] sample repository
- [ ] development scripts

### M1 — Program White-Box Pipeline

- [ ] Python repository parser
- [ ] function hierarchy
- [ ] runtime tracer
- [ ] behavior → logic → function hierarchy
- [ ] first progressive-disclosure UI

### M2 — AI Exploration Pipeline

- [ ] agent event schema
- [ ] tool-event ingestion
- [ ] repository / file / symbol exploration visualization
- [ ] backtracking representation

### M3 — Execution–Exploration Coupling

- [ ] node/event mapping
- [ ] aligned-region encoding
- [ ] exploration–execution gap detection
- [ ] coupled brushing / highlighting

### M4 — Visualization-as-Control

- [ ] visual selection
- [ ] search-scope generation
- [ ] context-scope generation
- [ ] edit-scope generation
- [ ] scope-contract UI
- [ ] coding-agent adapter

### M5 — Verification

- [ ] before / after execution
- [ ] test-result comparison
- [ ] code diff
- [ ] execution diff
- [ ] edit-scope violation detection

### M6 — Research Prototype

- [ ] reproduce paper scenarios
- [ ] interaction logging
- [ ] benchmark dataset
- [ ] user-study mode
- [ ] screenshot / trace export
- [ ] documentation

---

## 16. Prototype Layout

Initial information architecture:

```text
┌───────────────────────────────────────────────────────────────┐
│ Run / Task / Agent / Status                                  │
├──────────────┬───────────────────────────────┬────────────────┤
│              │                               │                │
│ Repository   │ Program Execution Pipeline    │ Evidence       │
│ / Sessions   │                               │ Inspector      │
│              │ Behavior                     │                │
│              │   ↓                           │ Source         │
│              │ Logic                        │ Runtime        │
│              │   ↓                           │ Agent event    │
│              │ Function                     │ Tests          │
│              │                               │                │
├──────────────┼───────────────────────────────┼────────────────┤
│              │ AI Exploration Pipeline       │ Scope Control  │
│              │ Repo → File → Function → Test │ Search         │
│              │                               │ Context        │
│              │                               │ Edit           │
├──────────────┴───────────────────────────────┴────────────────┤
│ Before / After Verification                                  │
└───────────────────────────────────────────────────────────────┘
```

This wireframe is an information-architecture reference, not a final visual design.

---

## 17. Research Questions

### RQ1

Can progressive computational disclosure help users understand unfamiliar AI-generated code across abstraction levels?

### RQ2

Can coupled execution–exploration visualization help users recognize when a coding agent is searching in regions poorly supported by runtime evidence?

### RQ3

Can visual scope controls help users steer agent search and editing with less manual repository navigation and fewer unintended modifications?

### RQ4

Can execution-aware verification help users assess whether a scoped AI edit solved the target problem without introducing unexpected behavioral changes?

---

## 18. Evaluation Hooks

The system should record interaction telemetry needed for later evaluation:

- time to locate a fault;
- number of files inspected;
- number of disclosure expansions;
- agent search steps;
- exploration–execution gap duration;
- human steering interventions;
- edit-scope size;
- modified lines;
- scope violations;
- tests passed before / after;
- task completion;
- final correctness.

Experiment logging must be optional and explicitly enabled.

---

## 19. Engineering Principles

1. **Paper and system stay aligned.**  
   Features should support the research questions rather than exist only for visual appeal.

2. **No hidden-CoT dependency.**  
   PipeLens visualizes observable agent actions, not private model reasoning.

3. **Semantic zoom, not geometric zoom.**  
   Each disclosure level introduces a meaningful computational abstraction.

4. **Visualization is actionable.**  
   Selection should become search, context, or edit constraints.

5. **Evidence over decoration.**  
   Every encoding should communicate program state, agent action, correspondence, uncertainty, or verification evidence.

6. **Accessibility by design.**  
   Important states use multiple visual channels rather than color alone.

7. **Git is the source of truth.**  
   All implementation changes should be committed to this repository.

---

## 20. Planned Repository Structure

```text
PipeLens/
├── README.md
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── views/
│   │   │   ├── ProgressiveDisclosure/
│   │   │   ├── ExecutionPipeline/
│   │   │   ├── ExplorationPipeline/
│   │   │   ├── EvidenceInspector/
│   │   │   ├── ScopeControl/
│   │   │   └── Verification/
│   │   ├── model/
│   │   ├── store/
│   │   └── api/
│   └── package.json
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── models/
│   │   ├── analysis/
│   │   ├── tracing/
│   │   ├── agents/
│   │   └── verification/
│   └── pyproject.toml
│
├── packages/
│   └── schema/
│
├── examples/
│   └── python-debug-demo/
│
├── data/
├── scripts/
├── tests/
└── docs/
    ├── architecture.md
    ├── visual-design.md
    └── research-protocol.md
```

---

## 21. Immediate Next Step

Implementation starts with **M0 + M1**:

1. create frontend/backend project skeletons;
2. define shared trace schemas;
3. create a small Python debugging example;
4. implement function-level runtime tracing;
5. render the first execution pipeline;
6. add progressive disclosure from behavior → function → statement.

The first development checkpoint is:

> **Given a failing Python program, PipeLens can show the executed computation as a hierarchy and let the user drill from a high-level behavior to the responsible function and source lines.**

---

## Status

**Current stage:** research prototype planning → system implementation  
**Target paper:** PacificVis / TVCG Track  
**Current paper concept:** Progressive White-Box Visual Analytics for AI Coding
