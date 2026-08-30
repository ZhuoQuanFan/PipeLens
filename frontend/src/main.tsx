import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { fetchDemoTrace } from "./api/trace";
import type { AgentEvent, ProgramNode, TraceBundle } from "./model/trace";
import "./styles.css";
import "./m2.css";

type Level = "Behavior" | "Logic" | "Function" | "Dataflow" | "Statement";
type DisclosureNode = { level: Level; title: string; subtitle: string; code?: string };
type ExplorationStatus = "aligned" | "gap" | "context";

const fallbackDisclosure: DisclosureNode[] = [
  { level: "Behavior", title: "A → B", subtitle: "Observed transformation" },
  { level: "Logic", title: "A → normalize → B", subtitle: "Semantic stage" },
  { level: "Function", title: "normalize(x)", subtitle: "Executed function" },
  { level: "Dataflow", title: "x → transform → y", subtitle: "Value transformation" },
  { level: "Statement", title: "source line", subtitle: "Concrete implementation", code: "return [v / span for v in values]" },
];

function App() {
  const [trace, setTrace] = useState<TraceBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [levelIndex, setLevelIndex] = useState(2);
  const [selectedExecution, setSelectedExecution] = useState("normalize()");
  const [selectedExplorationEventId, setSelectedExplorationEventId] = useState<string | null>(null);
  const [scopeLocked, setScopeLocked] = useState(false);

  useEffect(() => {
    fetchDemoTrace()
      .then((bundle) => {
        setTrace(bundle);
        const normalizeNode = bundle.program_nodes.find(
          (node) => node.level === "function" && node.label === "normalize()" && node.runtime.executed,
        );
        const firstExecuted = bundle.program_nodes.find(
          (node) => node.level === "function" && node.runtime.executed,
        );
        if (normalizeNode ?? firstExecuted) {
          setSelectedExecution((normalizeNode ?? firstExecuted)!.label);
        }

        const firstGap = bundle.agent_events.find(
          (event) => event.target && explorationStatus(event, bundle) === "gap",
        );
        setSelectedExplorationEventId(firstGap?.id ?? bundle.agent_events[0]?.id ?? null);
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

  const selectedAgentEvent = useMemo(
    () => trace?.agent_events.find((event) => event.id === selectedExplorationEventId),
    [trace, selectedExplorationEventId],
  );

  const selectedAgentLink = useMemo(
    () => trace?.links.find((link) => link.agent_event_id === selectedExplorationEventId),
    [trace, selectedExplorationEventId],
  );

  const linkedAgentNode = useMemo(
    () => trace?.program_nodes.find((node) => node.id === selectedAgentLink?.execution_node_id),
    [trace, selectedAgentLink],
  );

  const coupledExecutionLabels = useMemo(() => {
    if (!trace || !linkedAgentNode) return new Set<string>();
    return new Set(executedFunctionDescendants(linkedAgentNode, trace.program_nodes).map((node) => node.label));
  }, [trace, linkedAgentNode]);

  const relatedAgentEventIds = useMemo(() => {
    if (!trace || !selectedProgramNode) return new Set<string>();
    const relatedNodeIds = new Set([selectedProgramNode.id, ...ancestorIds(selectedProgramNode, trace.program_nodes)]);
    return new Set(
      trace.links
        .filter((link) => relatedNodeIds.has(link.execution_node_id))
        .map((link) => link.agent_event_id),
    );
  }, [trace, selectedProgramNode]);

  const disclosure = useMemo(
    () => buildDisclosure(selectedProgramNode, trace?.program_nodes ?? []),
    [selectedProgramNode, trace],
  );

  const current = disclosure[levelIndex] ?? fallbackDisclosure[levelIndex];
  const selectedExplorationStatus = trace && selectedAgentEvent
    ? explorationStatus(selectedAgentEvent, trace)
    : "context";
  const gap = selectedExplorationStatus === "gap";

  const couplingStats = useMemo(() => {
    if (!trace) return { targetEvents: 0, mapped: 0, aligned: 0 };
    const targetEvents = trace.agent_events.filter((event) => event.target).length;
    const mapped = trace.agent_events.filter(
      (event) => event.target && trace.links.some((link) => link.agent_event_id === event.id),
    ).length;
    const aligned = trace.agent_events.filter(
      (event) => event.target && explorationStatus(event, trace) === "aligned",
    ).length;
    return { targetEvents, mapped, aligned };
  }, [trace]);

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

  useEffect(() => {
    setScopeLocked(false);
  }, [selectedExecution]);

  function handleExplorationSelect(eventId: string) {
    setSelectedExplorationEventId(eventId);
    if (!trace) return;

    const event = trace.agent_events.find((candidate) => candidate.id === eventId);
    if (!event || explorationStatus(event, trace) !== "aligned") return;

    const link = trace.links.find((candidate) => candidate.agent_event_id === eventId);
    const linkedNode = trace.program_nodes.find((candidate) => candidate.id === link?.execution_node_id);
    if (!linkedNode) return;

    if (linkedNode.level === "function" && linkedNode.runtime.executed) {
      setSelectedExecution(linkedNode.label);
      return;
    }

    const descendants = executedFunctionDescendants(linkedNode, trace.program_nodes);
    if (descendants.length === 1) {
      setSelectedExecution(descendants[0].label);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Progressive White-Box Visual Analytics</div>
          <h1>PipeLens</h1>
        </div>
        <div className="status-pill">
          {trace ? `trace: ${trace.session_id}` : loadError ? "offline fallback" : "loading trace…"}
        </div>
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
            <button
              key={node.level}
              className={index === levelIndex ? "level-tab active" : "level-tab"}
              onClick={() => setLevelIndex(index)}
              type="button"
            >
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
          <div className="panel-heading compact">
            <div>
              <h2>Execution–Exploration Coupling</h2>
              <p>Compare what the program executed with observable coding-agent actions.</p>
            </div>
            {trace ? (
              <div className="coupling-metrics" aria-label="Coupling coverage">
                <span><strong>{couplingStats.mapped}</strong>/{couplingStats.targetEvents} mapped</span>
                <span><strong>{couplingStats.aligned}</strong> runtime-aligned</span>
              </div>
            ) : null}
          </div>

          <ExecutionLane
            items={execution}
            selected={selectedExecution}
            coupled={coupledExecutionLabels}
            onSelect={setSelectedExecution}
          />

          <div className="coupling-divider" aria-hidden="true">
            <span className={gap ? "gap-marker" : "aligned-marker"}>{gap ? "×" : "↕"}</span>
          </div>

          <ExplorationLane
            events={trace?.agent_events ?? []}
            trace={trace}
            selectedEventId={selectedExplorationEventId}
            relatedEventIds={relatedAgentEventIds}
            onSelect={handleExplorationSelect}
          />

          <div className={gap ? "gap-callout" : "aligned-callout"}>
            <strong>{gap ? "Exploration–Execution Gap" : "Execution-supported exploration"}</strong>
            <span>{couplingDescription(selectedAgentEvent, linkedAgentNode, selectedExplorationStatus)}</span>
          </div>
        </div>

        <aside className="panel scope-panel">
          <div className="panel-heading compact">
            <div>
              <h2>Visualization-as-Control</h2>
              <p>Turn the selected computation into explicit agent scopes.</p>
            </div>
          </div>

          <div className="selection-summary">
            <span>Selected computation</span>
            <strong>{selectedExecution}</strong>
          </div>

          <ScopeCard label="Search scope" value={scope.search} icon="⌕" />
          <ScopeCard label="Context scope" value={scope.context} icon="▤" />
          <ScopeCard label="Edit scope" value={scope.edit} icon="✎" />

          <button
            className={scopeLocked ? "primary-action scope-locked" : "primary-action"}
            type="button"
            onClick={() => setScopeLocked((value) => !value)}
            aria-pressed={scopeLocked}
          >
            {scopeLocked ? "Scope locked for agent" : "Focus agent here"}
          </button>
          {scopeLocked ? (
            <div className="scope-confirmation" role="status">
              The current visual selection is now the proposed search/context/edit boundary.
            </div>
          ) : null}
        </aside>
      </section>

      <section className="panel verification-panel">
        <div className="panel-heading compact">
          <div>
            <h2>Verification</h2>
            <p>Use explicit evidence rather than decorative scores.</p>
          </div>
        </div>
        <div className="verification-grid">
          <div className="verification-card before">
            <span>Before patch</span>
            <strong>0 / 2 tests passed</strong>
            <small>Normalization behavior is incorrect.</small>
          </div>
          <div className="verification-arrow">→</div>
          <div className="verification-card after">
            <span>Target after patch</span>
            <strong>2 / 2 tests passed</strong>
            <small>Edit remains inside the selected scope.</small>
          </div>
        </div>
      </section>
    </main>
  );
}

function buildDisclosure(node: ProgramNode | undefined, allNodes: ProgramNode[]): DisclosureNode[] {
  if (!node) return fallbackDisclosure;
  const statements = allNodes.filter(
    (candidate) => candidate.parent_id === node.id && candidate.level === "statement",
  );
  const statement = statements.find((item) => item.label.includes("/ span"))
    ?? [...statements].reverse().find((item) => item.label.includes("return"))
    ?? statements[0];
  return [
    { level: "Behavior", title: "Input → Output", subtitle: "Observed program behavior" },
    { level: "Logic", title: `… → ${node.label} → …`, subtitle: "Selected computation in the executed pipeline" },
    { level: "Function", title: node.label, subtitle: node.file ? `${node.file}:${node.start_line ?? "?"}` : "Executed function" },
    { level: "Dataflow", title: "inputs → computation → outputs", subtitle: formatRuntime(node) },
    {
      level: "Statement",
      title: statement?.label ?? "source statement",
      subtitle: statement?.file ? `${statement.file}:${statement.start_line ?? "?"}` : "Concrete implementation",
      code: statement?.label,
    },
  ];
}

function formatRuntime(node: ProgramNode): string {
  const inputs = Object.entries(node.runtime.input_values ?? {})
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ");
  const output = node.runtime.output_values?.return;
  return [inputs && `in: ${inputs}`, output !== undefined && `out: ${String(output)}`]
    .filter(Boolean)
    .join(" · ") || "Runtime values unavailable";
}

function ancestorIds(node: ProgramNode, nodes: ProgramNode[]): string[] {
  const byId = new Map(nodes.map((candidate) => [candidate.id, candidate]));
  const ids: string[] = [];
  let parentId = node.parent_id;
  while (parentId) {
    ids.push(parentId);
    parentId = byId.get(parentId)?.parent_id ?? null;
  }
  return ids;
}

function executedFunctionDescendants(node: ProgramNode, nodes: ProgramNode[]): ProgramNode[] {
  if (node.level === "function") {
    return node.runtime.executed ? [node] : [];
  }

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

function hasExecutedEvidence(node: ProgramNode, nodes: ProgramNode[]): boolean {
  if (node.runtime.executed) return true;
  return executedFunctionDescendants(node, nodes).length > 0;
}

function explorationStatus(event: AgentEvent, trace: TraceBundle): ExplorationStatus {
  if (!event.target) return "context";
  const link = trace.links.find((candidate) => candidate.agent_event_id === event.id);
  if (!link) return "gap";
  const node = trace.program_nodes.find((candidate) => candidate.id === link.execution_node_id);
  if (!node) return "gap";
  return hasExecutedEvidence(node, trace.program_nodes) ? "aligned" : "gap";
}

function couplingDescription(
  event: AgentEvent | undefined,
  linkedNode: ProgramNode | undefined,
  status: ExplorationStatus,
): string {
  if (!event) return "Select an observable agent action to inspect its relation to runtime evidence.";
  const target = eventTargetLabel(event);
  if (status === "context") {
    return `${event.type} is a contextual agent action without a direct program target.`;
  }
  if (status === "gap") {
    return linkedNode
      ? `The agent inspected ${target}, but this region has no execution evidence in the selected run.`
      : `The agent inspected ${target}, but PipeLens cannot map that action to the current program execution.`;
  }
  return `The agent action on ${target} maps to ${linkedNode?.label ?? "an executed region"} with runtime support. The corresponding execution region is highlighted.`;
}

function eventTargetLabel(event: AgentEvent): string {
  if (event.target?.symbol) return `${event.target.symbol}()`;
  if (event.target?.file) return event.target.file;
  if (typeof event.observable_input === "string") return event.observable_input;
  return event.type.replaceAll("_", " ");
}

function ExecutionLane({
  items,
  selected,
  coupled,
  onSelect,
}: {
  items: string[];
  selected: string;
  coupled: Set<string>;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="pipeline-lane execution">
      <div className="lane-label">
        <strong>Program execution</strong>
        <span>What actually ran</span>
      </div>
      <div className="lane-flow">
        {items.map((item, index) => {
          const classes = ["pipeline-node"];
          if (item === selected) classes.push("selected");
          if (coupled.has(item)) classes.push("coupled");
          return (
            <React.Fragment key={`${item}-${index}`}>
              <button
                className={classes.join(" ")}
                type="button"
                onClick={() => {
                  if (item !== "Input" && item !== "Output") onSelect(item);
                }}
              >
                {item}
              </button>
              {index < items.length - 1 ? <span className="flow-arrow">→</span> : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function ExplorationLane({
  events,
  trace,
  selectedEventId,
  relatedEventIds,
  onSelect,
}: {
  events: AgentEvent[];
  trace: TraceBundle | null;
  selectedEventId: string | null;
  relatedEventIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="pipeline-lane exploration exploration-rich">
      <div className="lane-label">
        <strong>AI exploration</strong>
        <span>Observable agent actions</span>
      </div>
      <div className="agent-event-flow">
        {events.length === 0 ? <span className="empty-events">No agent events loaded</span> : null}
        {events.map((event, index) => {
          const status = trace ? explorationStatus(event, trace) : "context";
          const classes = ["agent-event-node", status];
          if (event.id === selectedEventId) classes.push("selected");
          if (relatedEventIds.has(event.id)) classes.push("coupled");
          return (
            <React.Fragment key={event.id}>
              <button
                className={classes.join(" ")}
                type="button"
                onClick={() => onSelect(event.id)}
                aria-label={`${event.type}: ${eventTargetLabel(event)}`}
              >
                <span className="event-index">{index + 1}</span>
                <span className="event-type">{event.type.replaceAll("_", " ")}</span>
                <strong>{eventTargetLabel(event)}</strong>
                <small>{status === "aligned" ? "runtime-linked" : status === "gap" ? "gap" : "context"}</small>
              </button>
              {index < events.length - 1 ? <span className="flow-arrow">→</span> : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function ScopeCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="scope-card">
      <div className="scope-icon">{icon}</div>
      <div>
        <strong>{label}</strong>
        <p>{value}</p>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
