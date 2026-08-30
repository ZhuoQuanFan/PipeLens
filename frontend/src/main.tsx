import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { fetchDemoTrace } from "./api/trace";
import type { AgentEvent, ProgramNode, TraceBundle } from "./model/trace";
import "./styles.css";
import "./m2.css";

type Level = "Behavior" | "Logic" | "Function" | "Dataflow" | "Statement";
type DisclosureNode = { level: Level; title: string; subtitle: string; code?: string };
type ExplorationStatus = "aligned" | "gap" | "context";

const fallback: DisclosureNode[] = [
  { level: "Behavior", title: "A → B", subtitle: "Observed transformation" },
  { level: "Logic", title: "A → normalize → B", subtitle: "Semantic stage" },
  { level: "Function", title: "normalize(x)", subtitle: "Executed function" },
  { level: "Dataflow", title: "x → y", subtitle: "Value transformation" },
  { level: "Statement", title: "source line", subtitle: "Concrete implementation", code: "return [v / span for v in values]" },
];

function App() {
  const [trace, setTrace] = useState<TraceBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(2);
  const [execution, setExecution] = useState("normalize()");
  const [eventId, setEventId] = useState<string | null>(null);
  const [scopeLocked, setScopeLocked] = useState(false);

  useEffect(() => {
    fetchDemoTrace()
      .then((bundle) => {
        setTrace(bundle);
        const preferred = bundle.program_nodes.find(
          (node) => node.level === "function" && node.label === "normalize()" && node.runtime.executed,
        ) ?? bundle.program_nodes.find((node) => node.level === "function" && node.runtime.executed);
        if (preferred) setExecution(preferred.label);
        const firstGap = bundle.agent_events.find(
          (event) => event.target && explorationStatus(event, bundle) === "gap",
        );
        setEventId(firstGap?.id ?? bundle.agent_events[0]?.id ?? null);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Unable to load trace"));
  }, []);

  const executionItems = useMemo(() => {
    if (!trace) return ["Input", "preprocess()", "normalize()", "score()", "Output"];
    const functions = trace.program_nodes
      .filter((node) => node.level === "function" && node.runtime.executed)
      .sort((a, b) => (a.runtime.start_time ?? 0) - (b.runtime.start_time ?? 0))
      .map((node) => node.label);
    return ["Input", ...functions, "Output"];
  }, [trace]);

  const selectedNode = trace?.program_nodes.find((node) => node.label === execution);
  const selectedEvent = trace?.agent_events.find((event) => event.id === eventId);
  const selectedLink = trace?.links.find((link) => link.agent_event_id === eventId);
  const linkedNode = trace?.program_nodes.find((node) => node.id === selectedLink?.execution_node_id);
  const disclosure = buildDisclosure(selectedNode, trace?.program_nodes ?? []);
  const current = disclosure[level] ?? fallback[level];
  const status = trace && selectedEvent ? explorationStatus(selectedEvent, trace) : "context";
  const gap = status === "gap";

  const coupledExecution = useMemo(() => {
    if (!trace || !linkedNode) return new Set<string>();
    return new Set(executedFunctionDescendants(linkedNode, trace.program_nodes).map((node) => node.label));
  }, [trace, linkedNode]);

  const relatedEvents = useMemo(() => {
    if (!trace || !selectedNode) return new Set<string>();
    const nodeIds = new Set([selectedNode.id, ...ancestorIds(selectedNode, trace.program_nodes)]);
    return new Set(trace.links.filter((link) => nodeIds.has(link.execution_node_id)).map((link) => link.agent_event_id));
  }, [trace, selectedNode]);

  const metrics = useMemo(() => {
    if (!trace) return { target: 0, mapped: 0, aligned: 0 };
    const target = trace.agent_events.filter((event) => event.target).length;
    const mapped = trace.agent_events.filter(
      (event) => event.target && trace.links.some((link) => link.agent_event_id === event.id),
    ).length;
    const aligned = trace.agent_events.filter(
      (event) => event.target && explorationStatus(event, trace) === "aligned",
    ).length;
    return { target, mapped, aligned };
  }, [trace]);

  const scope = {
    search: `${execution} + callers + callees + tests`,
    context: `${execution} + runtime values + failing test`,
    edit: selectedNode?.file
      ? `${selectedNode.file}:${selectedNode.start_line ?? "?"}-${selectedNode.end_line ?? "?"}`
      : `${execution} only`,
  };

  useEffect(() => setScopeLocked(false), [execution]);

  function selectEvent(id: string) {
    setEventId(id);
    if (!trace) return;
    const event = trace.agent_events.find((candidate) => candidate.id === id);
    if (!event || explorationStatus(event, trace) !== "aligned") return;
    const link = trace.links.find((candidate) => candidate.agent_event_id === id);
    const node = trace.program_nodes.find((candidate) => candidate.id === link?.execution_node_id);
    if (!node) return;
    if (node.level === "function" && node.runtime.executed) return setExecution(node.label);
    const descendants = executedFunctionDescendants(node, trace.program_nodes);
    if (descendants.length === 1) setExecution(descendants[0].label);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><div className="eyebrow">Progressive White-Box Visual Analytics</div><h1>PipeLens</h1></div>
        <div className="status-pill">{trace ? `trace: ${trace.session_id}` : error ? "offline fallback" : "loading trace…"}</div>
      </header>

      <section className="panel disclosure-panel">
        <PanelHeading title="Progressive Computational Disclosure" text="Reveal the same computation from behavior to source-level implementation." />
        <div className="level-tabs" role="tablist" aria-label="Disclosure level">
          {disclosure.map((item, index) => (
            <button key={item.level} className={index === level ? "level-tab active" : "level-tab"} onClick={() => setLevel(index)} type="button">
              <span>{index + 1}</span>{item.level}
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
          <div className="panel-heading compact">
            <div><h2>Execution–Exploration Coupling</h2><p>Compare what the program executed with observable coding-agent actions.</p></div>
            {trace ? <div className="coupling-metrics"><span><strong>{metrics.mapped}</strong>/{metrics.target} mapped</span><span><strong>{metrics.aligned}</strong> runtime-aligned</span></div> : null}
          </div>
          <ExecutionLane items={executionItems} selected={execution} coupled={coupledExecution} onSelect={setExecution} />
          <div className="coupling-divider"><span className={gap ? "gap-marker" : "aligned-marker"}>{gap ? "×" : "↕"}</span></div>
          <ExplorationLane events={trace?.agent_events ?? []} trace={trace} selectedId={eventId} relatedIds={relatedEvents} onSelect={selectEvent} />
          <div className={gap ? "gap-callout" : "aligned-callout"}>
            <strong>{gap ? "Exploration–Execution Gap" : "Execution-supported exploration"}</strong>
            <span>{couplingDescription(selectedEvent, linkedNode, status)}</span>
          </div>
        </div>

        <aside className="panel scope-panel">
          <PanelHeading title="Visualization-as-Control" text="Turn the selected computation into explicit agent scopes." compact />
          <div className="selection-summary"><span>Selected computation</span><strong>{execution}</strong></div>
          <ScopeCard label="Search scope" value={scope.search} icon="⌕" />
          <ScopeCard label="Context scope" value={scope.context} icon="▤" />
          <ScopeCard label="Edit scope" value={scope.edit} icon="✎" />
          <button className={scopeLocked ? "primary-action scope-locked" : "primary-action"} type="button" onClick={() => setScopeLocked((value) => !value)}>
            {scopeLocked ? "Scope locked for agent" : "Focus agent here"}
          </button>
          {scopeLocked ? <div className="scope-confirmation">The visual selection is now the proposed search/context/edit boundary.</div> : null}
        </aside>
      </section>

      <section className="panel verification-panel">
        <PanelHeading title="Verification" text="Use explicit evidence rather than decorative scores." compact />
        <div className="verification-grid">
          <div className="verification-card before"><span>Before patch</span><strong>0 / 2 tests passed</strong><small>Normalization behavior is incorrect.</small></div>
          <div className="verification-arrow">→</div>
          <div className="verification-card after"><span>Target after patch</span><strong>2 / 2 tests passed</strong><small>Edit remains inside the selected scope.</small></div>
        </div>
      </section>
    </main>
  );
}

function buildDisclosure(node: ProgramNode | undefined, nodes: ProgramNode[]): DisclosureNode[] {
  if (!node) return fallback;
  const byId = new Map(nodes.map((candidate) => [candidate.id, candidate]));
  const flows = node.children.map((id) => byId.get(id)).filter((item): item is ProgramNode => item?.level === "dataflow");
  const flow = flows.find((item) => item.expression?.includes("/ span"))
    ?? [...flows].reverse().find((item) => item.dataflow_outputs.includes("return"))
    ?? flows.at(-1);
  const statement = flow?.children.map((id) => byId.get(id)).find((item) => item?.level === "statement")
    ?? node.children.map((id) => byId.get(id)).find((item) => item?.level === "statement");
  const flowTitle = flow
    ? `${flow.dataflow_inputs.join(", ") || "constant"} → ${flow.dataflow_outputs.join(", ") || "effect"}`
    : "inputs → computation → outputs";
  return [
    { level: "Behavior", title: "Input → Output", subtitle: "Observed program behavior" },
    { level: "Logic", title: `… → ${node.label} → …`, subtitle: "Selected computation in the executed pipeline" },
    { level: "Function", title: node.label, subtitle: `${location(node)} · ${formatRuntime(node)}` },
    { level: "Dataflow", title: flowTitle, subtitle: flow ? `${flow.expression ?? flow.label} · ${location(flow)}` : formatRuntime(node) },
    { level: "Statement", title: statement?.label ?? "source statement", subtitle: statement ? location(statement) : "Concrete implementation", code: statement?.label },
  ];
}

function location(node: ProgramNode) {
  return node.file ? `${node.file}:${node.start_line ?? "?"}` : "source";
}

function formatRuntime(node: ProgramNode) {
  const inputs = Object.entries(node.runtime.input_values ?? {}).map(([key, value]) => `${key}=${String(value)}`).join(", ");
  const output = node.runtime.output_values?.return;
  return [inputs && `in: ${inputs}`, output !== undefined && `out: ${String(output)}`].filter(Boolean).join(" · ") || "Runtime values unavailable";
}

function ancestorIds(node: ProgramNode, nodes: ProgramNode[]) {
  const byId = new Map(nodes.map((candidate) => [candidate.id, candidate]));
  const result: string[] = [];
  let parentId = node.parent_id;
  while (parentId) {
    result.push(parentId);
    parentId = byId.get(parentId)?.parent_id ?? null;
  }
  return result;
}

function executedFunctionDescendants(node: ProgramNode, nodes: ProgramNode[]): ProgramNode[] {
  if (node.level === "function") return node.runtime.executed ? [node] : [];
  const byId = new Map(nodes.map((candidate) => [candidate.id, candidate]));
  const queue = [...node.children];
  const visited = new Set<string>();
  const result: ProgramNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const child = byId.get(id);
    if (!child) continue;
    if (child.level === "function" && child.runtime.executed) result.push(child);
    queue.push(...child.children);
  }
  return result;
}

function explorationStatus(event: AgentEvent, trace: TraceBundle): ExplorationStatus {
  if (!event.target) return "context";
  const link = trace.links.find((candidate) => candidate.agent_event_id === event.id);
  const node = trace.program_nodes.find((candidate) => candidate.id === link?.execution_node_id);
  if (!node) return "gap";
  return node.runtime.executed || executedFunctionDescendants(node, trace.program_nodes).length ? "aligned" : "gap";
}

function couplingDescription(event: AgentEvent | undefined, node: ProgramNode | undefined, status: ExplorationStatus) {
  if (!event) return "Select an observable agent action to inspect its relation to runtime evidence.";
  const target = targetLabel(event);
  if (status === "context") return `${event.type} is a contextual agent action without a direct program target.`;
  if (status === "gap") return node
    ? `The agent inspected ${target}, but this region has no execution evidence in the selected run.`
    : `The agent inspected ${target}, but PipeLens cannot map that action to the current program execution.`;
  return `The agent action on ${target} maps to ${node?.label ?? "an executed region"} with runtime support.`;
}

function targetLabel(event: AgentEvent) {
  if (event.target?.symbol) return `${event.target.symbol}()`;
  if (event.target?.file) return event.target.file;
  if (typeof event.observable_input === "string") return event.observable_input;
  return event.type.replaceAll("_", " ");
}

function PanelHeading({ title, text, compact = false }: { title: string; text: string; compact?: boolean }) {
  return <div className={compact ? "panel-heading compact" : "panel-heading"}><div><h2>{title}</h2><p>{text}</p></div></div>;
}

function ExecutionLane({ items, selected, coupled, onSelect }: { items: string[]; selected: string; coupled: Set<string>; onSelect: (value: string) => void }) {
  return <div className="pipeline-lane execution"><div className="lane-label"><strong>Program execution</strong><span>What actually ran</span></div><div className="lane-flow">
    {items.map((item, index) => <React.Fragment key={`${item}-${index}`}><button className={`pipeline-node${item === selected ? " selected" : ""}${coupled.has(item) ? " coupled" : ""}`} type="button" onClick={() => item !== "Input" && item !== "Output" && onSelect(item)}>{item}</button>{index < items.length - 1 ? <span className="flow-arrow">→</span> : null}</React.Fragment>)}
  </div></div>;
}

function ExplorationLane({ events, trace, selectedId, relatedIds, onSelect }: { events: AgentEvent[]; trace: TraceBundle | null; selectedId: string | null; relatedIds: Set<string>; onSelect: (id: string) => void }) {
  return <div className="pipeline-lane exploration exploration-rich"><div className="lane-label"><strong>AI exploration</strong><span>Observable agent actions</span></div><div className="agent-event-flow">
    {events.length === 0 ? <span className="empty-events">No agent events loaded</span> : null}
    {events.map((event, index) => {
      const status = trace ? explorationStatus(event, trace) : "context";
      return <React.Fragment key={event.id}><button className={`agent-event-node ${status}${event.id === selectedId ? " selected" : ""}${relatedIds.has(event.id) ? " coupled" : ""}`} type="button" onClick={() => onSelect(event.id)}><span className="event-index">{index + 1}</span><span className="event-type">{event.type.replaceAll("_", " ")}</span><strong>{targetLabel(event)}</strong><small>{status === "aligned" ? "runtime-linked" : status}</small></button>{index < events.length - 1 ? <span className="flow-arrow">→</span> : null}</React.Fragment>;
    })}
  </div></div>;
}

function ScopeCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return <div className="scope-card"><div className="scope-icon">{icon}</div><div><strong>{label}</strong><p>{value}</p></div></div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
