import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { fetchDemoTrace } from "./api/trace";
import type { ProgramNode, TraceBundle } from "./model/trace";
import "./styles.css";

type Level = "Behavior" | "Logic" | "Function" | "Dataflow" | "Statement";
type DisclosureNode = { level: Level; title: string; subtitle: string; code?: string };

const fallbackDisclosure: DisclosureNode[] = [
  { level: "Behavior", title: "A → B", subtitle: "Observed transformation" },
  { level: "Logic", title: "A → normalize → B", subtitle: "Semantic stage" },
  { level: "Function", title: "normalize(x)", subtitle: "Executed function" },
  { level: "Dataflow", title: "x → transform → y", subtitle: "Value transformation" },
  { level: "Statement", title: "source line", subtitle: "Concrete implementation", code: "return [v / span for v in values]" },
];

const exploration = ["Repo", "src/", "ranking.py", "rerank(x)", "tests/"];

function App() {
  const [trace, setTrace] = useState<TraceBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [levelIndex, setLevelIndex] = useState(2);
  const [selectedExecution, setSelectedExecution] = useState("normalize(x)");
  const [selectedExploration, setSelectedExploration] = useState("rerank(x)");

  useEffect(() => {
    fetchDemoTrace()
      .then((bundle) => {
        setTrace(bundle);
        const firstExecuted = bundle.program_nodes.find(
          (node) => node.level === "function" && node.runtime.executed,
        );
        if (firstExecuted) setSelectedExecution(firstExecuted.label);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Unable to load trace");
      });
  }, []);

  const execution = useMemo(() => {
    if (!trace) return ["Input", "preprocess()", "normalize()", "score()", "Output"];
    const functions = trace.program_nodes
      .filter((node) => node.level === "function" && node.runtime.executed)
      .sort((a, b) => (a.runtime.start_time ?? 0) - (b.runtime.start_time ?? 0))
      .map((node) => node.label);
    return ["Input", ...functions, "Output"];
  }, [trace]);

  const selectedProgramNode = useMemo(
    () => trace?.program_nodes.find((node) => node.label === selectedExecution),
    [trace, selectedExecution],
  );

  const disclosure = useMemo(
    () => buildDisclosure(selectedProgramNode, trace?.program_nodes ?? []),
    [selectedProgramNode, trace],
  );

  const current = disclosure[levelIndex] ?? fallbackDisclosure[levelIndex];
  const normalizedExecutionLabel = selectedExecution.replace(/\(\)$/, "(x)");
  const gap = normalizedExecutionLabel !== selectedExploration;

  const scope = useMemo(
    () => ({
      search: `${selectedExecution} + callers + callees + tests`,
      context: `${selectedExecution} + runtime values + failing test`,
      edit: selectedProgramNode?.file
        ? `${selectedProgramNode.file}:${selectedProgramNode.start_line ?? "?"}-${selectedProgramNode.end_line ?? "?"}`
        : `${selectedExecution} only`,
    }),
    [selectedExecution, selectedProgramNode],
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Progressive White-Box Visual Analytics</div>
          <h1>PipeLens</h1>
        </div>
        <div className="status-pill">{trace ? `trace: ${trace.session_id}` : loadError ? "offline fallback" : "loading trace…"}</div>
      </header>

      <section className="panel disclosure-panel">
        <div className="panel-heading">
          <div>
            <h2>Progressive Computational Disclosure</h2>
            <p>Reveal the same computation from behavior to source-level implementation.</p>
          </div>
          <div className="level-badge">{current.level}</div>
        </div>

        <div className="level-tabs" role="tablist" aria-label="Disclosure level">
          {disclosure.map((node, index) => (
            <button key={node.level} className={index === levelIndex ? "level-tab active" : "level-tab"} onClick={() => setLevelIndex(index)} type="button">
              <span>{index + 1}</span>{node.level}
            </button>
          ))}
        </div>

        <div className="disclosure-stage">
          <div className="stage-label">Behaviorally opaque</div>
          <div className="semantic-card">
            <div className="semantic-title">{current.title}</div>
            <div className="semantic-subtitle">{current.subtitle}</div>
            {current.code ? <pre>{current.code}</pre> : null}
          </div>
          <div className="stage-label right">Programmatically transparent</div>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="panel coupling-panel">
          <div className="panel-heading compact"><div><h2>Execution–Exploration Coupling</h2><p>Compare what the program executed with where the coding agent explored.</p></div></div>
          <PipelineLane label="Program execution" caption="What actually ran" items={execution} selected={selectedExecution} onSelect={setSelectedExecution} tone="execution" />
          <div className="coupling-divider" aria-hidden="true"><span className={gap ? "gap-marker" : "aligned-marker"}>{gap ? "×" : "↕"}</span></div>
          <PipelineLane label="AI exploration" caption="Where the agent looked" items={exploration} selected={selectedExploration} onSelect={setSelectedExploration} tone="exploration" />
          <div className={gap ? "gap-callout" : "aligned-callout"}>
            <strong>{gap ? "Exploration–Execution Gap" : "Aligned region"}</strong>
            <span>{gap ? `Runtime evidence points to ${selectedExecution}, while the agent is inspecting ${selectedExploration}.` : "The agent is inspecting the same computation supported by runtime evidence."}</span>
          </div>
        </div>

        <aside className="panel scope-panel">
          <div className="panel-heading compact"><div><h2>Visualization-as-Control</h2><p>Turn the selected computation into explicit agent scopes.</p></div></div>
          <div className="selection-summary"><span>Selected computation</span><strong>{selectedExecution}</strong></div>
          <ScopeCard label="Search scope" value={scope.search} icon="⌕" />
          <ScopeCard label="Context scope" value={scope.context} icon="▤" />
          <ScopeCard label="Edit scope" value={scope.edit} icon="✎" />
          <button className="primary-action" type="button">Focus agent here</button>
        </aside>
      </section>

      <section className="panel verification-panel">
        <div className="panel-heading compact"><div><h2>Verification</h2><p>Use explicit evidence rather than decorative scores.</p></div></div>
        <div className="verification-grid">
          <div className="verification-card before"><span>Before patch</span><strong>0 / 2 tests passed</strong><small>Normalization behavior is incorrect.</small></div>
          <div className="verification-arrow">→</div>
          <div className="verification-card after"><span>Target after patch</span><strong>2 / 2 tests passed</strong><small>Edit remains inside the selected scope.</small></div>
        </div>
      </section>
    </main>
  );
}

function buildDisclosure(node: ProgramNode | undefined, allNodes: ProgramNode[]): DisclosureNode[] {
  if (!node) return fallbackDisclosure;
  const statements = allNodes.filter((candidate) => candidate.parent_id === node.id && candidate.level === "statement");
  const statement = statements.find((item) => item.label.includes("return")) ?? statements[0];
  return [
    { level: "Behavior", title: "Input → Output", subtitle: "Observed program behavior" },
    { level: "Logic", title: `… → ${node.label} → …`, subtitle: "Selected computation in the executed pipeline" },
    { level: "Function", title: node.label, subtitle: node.file ? `${node.file}:${node.start_line ?? "?"}` : "Executed function" },
    { level: "Dataflow", title: "inputs → computation → outputs", subtitle: formatRuntime(node) },
    { level: "Statement", title: statement?.label ?? "source statement", subtitle: statement?.file ? `${statement.file}:${statement.start_line ?? "?"}` : "Concrete implementation", code: statement?.label },
  ];
}

function formatRuntime(node: ProgramNode): string {
  const inputs = Object.entries(node.runtime.input_values ?? {}).map(([key, value]) => `${key}=${String(value)}`).join(", ");
  const output = node.runtime.output_values?.return;
  return [inputs && `in: ${inputs}`, output !== undefined && `out: ${String(output)}`].filter(Boolean).join(" · ") || "Runtime values unavailable";
}

function PipelineLane({ label, caption, items, selected, onSelect, tone }: { label: string; caption: string; items: string[]; selected: string; onSelect: (value: string) => void; tone: "execution" | "exploration" }) {
  return <div className={`pipeline-lane ${tone}`}><div className="lane-label"><strong>{label}</strong><span>{caption}</span></div><div className="lane-flow">{items.map((item, index) => <React.Fragment key={`${item}-${index}`}><button className={item === selected ? "pipeline-node selected" : "pipeline-node"} type="button" onClick={() => setSelectable(item, onSelect)}>{item}</button>{index < items.length - 1 ? <span className="flow-arrow">→</span> : null}</React.Fragment>)}</div></div>;
}

function setSelectable(item: string, onSelect: (value: string) => void) {
  if (item !== "Input" && item !== "Output") onSelect(item);
}

function ScopeCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return <div className="scope-card"><div className="scope-icon">{icon}</div><div><strong>{label}</strong><p>{value}</p></div></div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
