import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Level = "Behavior" | "Logic" | "Function" | "Dataflow" | "Statement";

type DisclosureNode = {
  level: Level;
  title: string;
  subtitle: string;
  code?: string;
};

const nodes: DisclosureNode[] = [
  { level: "Behavior", title: "A → B", subtitle: "Observed transformation" },
  { level: "Logic", title: "A → normalize → B", subtitle: "Semantic stage" },
  { level: "Function", title: "normalize(x)", subtitle: "Executed function" },
  { level: "Dataflow", title: "x → transform → y", subtitle: "Value transformation" },
  {
    level: "Statement",
    title: "source line",
    subtitle: "Concrete implementation",
    code: "return [v / span for v in values]",
  },
];

const execution = ["Input", "preprocess(x)", "normalize(x)", "score(x)", "Output"];
const exploration = ["Repo", "src/", "ranking.py", "rerank(x)", "tests/"];

function App() {
  const [levelIndex, setLevelIndex] = useState(2);
  const [selectedExecution, setSelectedExecution] = useState("normalize(x)");
  const [selectedExploration, setSelectedExploration] = useState("rerank(x)");

  const current = nodes[levelIndex];
  const gap = selectedExecution !== selectedExploration;

  const scope = useMemo(
    () => ({
      search: `${selectedExecution} + callers + callees + tests`,
      context: `${selectedExecution} + runtime values + failing test`,
      edit: `${selectedExecution} only`,
    }),
    [selectedExecution],
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Progressive White-Box Visual Analytics</div>
          <h1>PipeLens</h1>
        </div>
        <div className="status-pill">M1 prototype</div>
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
          {nodes.map((node, index) => (
            <button
              key={node.level}
              className={index === levelIndex ? "level-tab active" : "level-tab"}
              onClick={() => setLevelIndex(index)}
              type="button"
            >
              <span>{index + 1}</span>
              {node.level}
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
              <p>Compare what the program executed with where the coding agent explored.</p>
            </div>
          </div>

          <PipelineLane
            label="Program execution"
            caption="What actually ran"
            items={execution}
            selected={selectedExecution}
            onSelect={setSelectedExecution}
            tone="execution"
          />

          <div className="coupling-divider" aria-hidden="true">
            <span className={gap ? "gap-marker" : "aligned-marker"}>{gap ? "×" : "↕"}</span>
          </div>

          <PipelineLane
            label="AI exploration"
            caption="Where the agent looked"
            items={exploration}
            selected={selectedExploration}
            onSelect={setSelectedExploration}
            tone="exploration"
          />

          <div className={gap ? "gap-callout" : "aligned-callout"}>
            <strong>{gap ? "Exploration–Execution Gap" : "Aligned region"}</strong>
            <span>
              {gap
                ? `Runtime evidence points to ${selectedExecution}, while the agent is inspecting ${selectedExploration}.`
                : "The agent is inspecting the same computation supported by runtime evidence."}
            </span>
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

          <button className="primary-action" type="button">
            Focus agent here
          </button>
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

function PipelineLane({
  label,
  caption,
  items,
  selected,
  onSelect,
  tone,
}: {
  label: string;
  caption: string;
  items: string[];
  selected: string;
  onSelect: (value: string) => void;
  tone: "execution" | "exploration";
}) {
  return (
    <div className={`pipeline-lane ${tone}`}>
      <div className="lane-label">
        <strong>{label}</strong>
        <span>{caption}</span>
      </div>
      <div className="lane-flow">
        {items.map((item, index) => (
          <React.Fragment key={item}>
            <button
              className={item === selected ? "pipeline-node selected" : "pipeline-node"}
              type="button"
              onClick={() => onSelect(item)}
            >
              {item}
            </button>
            {index < items.length - 1 ? <span className="flow-arrow">→</span> : null}
          </React.Fragment>
        ))}
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
