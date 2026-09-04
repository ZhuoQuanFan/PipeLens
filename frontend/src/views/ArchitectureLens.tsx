import { useMemo, useState } from "react";

import type { ArchitectureView, RepositoryGraph } from "../model/repositoryGraph";
import { searchRepositoryGraph } from "../model/repositoryGraph";

type Props = {
  active: boolean;
  graph: RepositoryGraph | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  selectedId: string | null;
  view: ArchitectureView;
  onMode: (mode: "demo" | "architecture") => void;
  onSelect: (nodeId: string) => void;
  onView: (view: ArchitectureView) => void;
};

export function ArchitectureLens({ active, graph, status, error, selectedId, view, onMode, onSelect, onView }: Props) {
  const [query, setQuery] = useState("");
  const [routeQuery, setRouteQuery] = useState("");
  const results = useMemo(() => graph ? searchRepositoryGraph(graph, query) : [], [graph, query]);
  const routeResults = useMemo(() => graph ? searchRepositoryGraph(graph, routeQuery, 5).filter((node) => node.id !== selectedId) : [], [graph, routeQuery, selectedId]);
  const selected = graph?.nodes.find((node) => node.id === selectedId) ?? null;

  return (
    <section className={`architecture-lens ${active ? "active" : ""}`} aria-label="Archify repository lens">
      <div className="architecture-lens-heading">
        <div>
          <span>ARCHIFY REPOSITORY LENS</span>
          <strong>Source-grounded structure inside PipeWorld</strong>
          <small>{status === "loading" ? "Analyzing workspace…" : graph ? `${graph.summary.files} modules · ${graph.summary.symbols} symbols · ${graph.summary.imports} imports · ${graph.summary.calls} calls` : error ?? "Waiting for workspace"}</small>
        </div>
        <div className="architecture-mode-switch" role="group" aria-label="Visualization mode">
          <button type="button" className={!active ? "active" : ""} onClick={() => onMode("demo")}>Debug demo</button>
          <button type="button" className={active ? "active" : ""} disabled={status !== "ready"} onClick={() => onMode("architecture")}>Repository map</button>
        </div>
      </div>

      {active && graph ? (
        <div className="architecture-tools">
          <label className="architecture-search">
            <span>FIND FILE OR SYMBOL</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search modules, classes, functions…" />
            {query ? <div className="architecture-results">
              {results.length ? results.map((node) => (
                <button type="button" key={node.id} onClick={() => { onSelect(node.id); setQuery(""); }}>
                  <strong>{node.label}</strong><small>{node.kind} · {node.anchor?.file ?? "external"}</small>
                </button>
              )) : <p>No grounded match</p>}
            </div> : null}
          </label>

          <div className="architecture-selection">
            <span>FOCUS</span>
            <strong>{selected?.label ?? "Repository overview"}</strong>
            <small>{selected?.anchor ? `${selected.anchor.file}:L${selected.anchor.start_line}` : selected?.kind ?? "all analyzed files"}</small>
          </div>

          <div className="architecture-actions">
            <button type="button" className={view.kind === "overview" ? "active" : ""} onClick={() => onView({ kind: "overview" })}>Overview</button>
            <button type="button" disabled={!selected} className={view.kind === "upstream" ? "active" : ""} onClick={() => selected && onView({ kind: "upstream", nodeId: selected.id })}>Upstream</button>
            <button type="button" disabled={!selected} className={view.kind === "downstream" ? "active" : ""} onClick={() => selected && onView({ kind: "downstream", nodeId: selected.id })}>Downstream</button>
          </div>

          <label className="architecture-search route-search">
            <span>TRACE DIRECTED ROUTE</span>
            <input disabled={!selected} value={routeQuery} onChange={(event) => setRouteQuery(event.target.value)} placeholder={selected ? `Route from ${selected.label} to…` : "Select a start node first"} />
            {routeQuery ? <div className="architecture-results">
              {routeResults.length ? routeResults.map((node) => (
                <button type="button" key={node.id} onClick={() => { if (selected) onView({ kind: "route", nodeId: selected.id, targetId: node.id }); setRouteQuery(""); }}>
                  <strong>{node.label}</strong><small>{node.anchor?.file ?? node.kind}</small>
                </button>
              )) : <p>No grounded match</p>}
            </div> : null}
          </label>
        </div>
      ) : null}

      {status === "error" ? <p className="architecture-error">{error}</p> : null}
      {graph?.warnings.length ? <p className="architecture-warning">{graph.warnings.length} file(s) produced parse warnings; the verified remainder is still shown.</p> : null}
    </section>
  );
}
