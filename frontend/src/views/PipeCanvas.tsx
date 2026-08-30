import type { PipeNode, ScriptedAgentStep } from "../cases/nanogpt";

type Props = {
  root: PipeNode;
  focus: PipeNode;
  path: PipeNode[];
  selectedId: string;
  agentSteps: ScriptedAgentStep[];
  activeAgentStep: number;
  onSelect: (node: PipeNode) => void;
  onNavigate: (node: PipeNode) => void;
  onAgentStep: (index: number) => void;
};

export function PipeCanvas({
  root,
  focus,
  path,
  selectedId,
  agentSteps,
  activeAgentStep,
  onSelect,
  onNavigate,
  onAgentStep,
}: Props) {
  const visible = focus.children?.length ? focus.children : [focus];
  const hasFault = visible.some((node) => node.status === "fault");

  return (
    <section className="pipe-stage" aria-label="Code pipeline visualization">
      <header className="pipe-stage-header">
        <div>
          <div className="case-kicker">FAMOUS CODE CASE · karpathy/nanoGPT</div>
          <h1>Code as an expandable pipe system</h1>
          <p>
            Blue pipes carry normal execution. Red pipes mark the fault-propagation path in a
            fault-injected replay. Click a component to open the smaller computation inside it.
          </p>
        </div>
        <div className="case-badge">fault-injected replay · original nanoGPT is not modified</div>
      </header>

      <nav className="pipe-breadcrumbs" aria-label="Semantic hierarchy">
        {path.map((node, index) => (
          <button key={node.id} type="button" onClick={() => onNavigate(node)}>
            <span>{node.level}</span>
            <strong>{node.label}</strong>
            {index < path.length - 1 ? <i>›</i> : null}
          </button>
        ))}
      </nav>

      <div className="pipe-viewport">
        <div className="pipe-legend">
          <span><i className="legend-line healthy" />normal execution</span>
          <span><i className="legend-line fault" />fault propagation</span>
          <span><i className="legend-agent" />scripted agent inspection</span>
        </div>

        <div className={`pipe-network ${hasFault ? "has-fault" : ""}`}>
          <Terminal label={path.length === 1 ? "Tokens" : "IN"} side="left" status={focus.status} />
          <div className={`pipe-segment inlet ${focus.status === "fault" ? "fault" : "healthy"}`} />

          <div className="pipe-parts">
            {visible.map((node, index) => {
              const next = visible[index + 1];
              const pipeStatus = node.status === "fault" || next?.status === "fault" ? "fault" : "healthy";
              return (
                <div className="pipe-part-group" key={node.id}>
                  <Part
                    node={node}
                    selected={node.id === selectedId}
                    agentActive={agentSteps[activeAgentStep]?.nodeId === node.id}
                    onClick={() => onSelect(node)}
                  />
                  {index < visible.length - 1 ? <div className={`pipe-segment between ${pipeStatus}`} /> : null}
                </div>
              );
            })}
          </div>

          <div className={`pipe-segment outlet ${focus.status === "fault" ? "fault" : "healthy"}`} />
          <Terminal label={path.length === 1 ? "Logits" : "OUT"} side="right" status={focus.status} />
        </div>

        {focus.children?.length ? (
          <div className="drill-hint">
            <span>↳</span>
            {focus.label} contains {focus.children.length} smaller computation part{focus.children.length === 1 ? "" : "s"}.
            Click a component to drill deeper.
          </div>
        ) : (
          <div className="drill-hint leaf"><span>•</span>Lowest visible semantic unit. Use the inspector to view its code anchor.</div>
        )}
      </div>

      <AgentReplay steps={agentSteps} active={activeAgentStep} onStep={onAgentStep} />
    </section>
  );
}

function Terminal({ label, side, status }: { label: string; side: "left" | "right"; status: PipeNode["status"] }) {
  return (
    <div className={`pipe-terminal ${side} ${status === "fault" ? "fault" : "healthy"}`}>
      <div className="terminal-cap" />
      <strong>{label}</strong>
    </div>
  );
}

function Part({
  node,
  selected,
  agentActive,
  onClick,
}: {
  node: PipeNode;
  selected: boolean;
  agentActive: boolean;
  onClick: () => void;
}) {
  const expandable = Boolean(node.children?.length);
  return (
    <button
      type="button"
      className={`pipe-component ${node.status} ${selected ? "selected" : ""} ${agentActive ? "agent-active" : ""}`}
      onClick={onClick}
      title={expandable ? `Open ${node.label}` : node.anchor?.source ?? node.label}
    >
      <span className="component-bolt tl" />
      <span className="component-bolt tr" />
      <span className="component-bolt bl" />
      <span className="component-bolt br" />
      <span className="component-level">{node.level}</span>
      <strong>{node.label}</strong>
      {node.subtitle ? <small>{node.subtitle}</small> : null}
      {expandable ? <span className="component-expand">open ×{node.children?.length}</span> : <span className="component-expand leaf">source</span>}
      {node.status === "fault" ? <span className="fault-flag">!</span> : null}
      {agentActive ? <span className="agent-probe">AI</span> : null}
    </button>
  );
}

function AgentReplay({ steps, active, onStep }: { steps: ScriptedAgentStep[]; active: number; onStep: (index: number) => void }) {
  const current = steps[active];
  return (
    <section className="agent-replay">
      <div className="agent-replay-title">
        <div><span>SCRIPTED AGENT REPLAY</span><strong>{current.action} · {current.target}</strong></div>
        <p>{current.note}</p>
      </div>
      <div className="agent-track">
        {steps.map((step, index) => (
          <button
            type="button"
            key={step.id}
            onClick={() => onStep(index)}
            className={`${step.state} ${index === active ? "active" : ""}`}
            aria-label={`${step.action} ${step.target}`}
          >
            <i>{index + 1}</i>
            <span>{step.action}</span>
            <strong>{step.target}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

export function PipeInspector({ node, root, onOpen }: { node: PipeNode; root: PipeNode; onOpen: (node: PipeNode) => void }) {
  return (
    <aside className="pipe-inspector">
      <div className="inspector-eyebrow">SELECTED PART</div>
      <h2>{node.label}</h2>
      <div className={`inspector-state ${node.status}`}>
        <i />{node.status === "fault" ? "fault path" : node.status === "healthy" ? "normal path" : "structural"}
      </div>

      <dl>
        <div><dt>semantic level</dt><dd>{node.level}</dd></div>
        <div><dt>source</dt><dd>{node.anchor?.file ?? "—"}</dd></div>
        <div><dt>symbol</dt><dd>{node.anchor?.symbol ?? "—"}</dd></div>
      </dl>

      {node.anchor?.source ? <pre className="source-anchor"><code>{node.anchor.source}</code></pre> : null}
      {node.children?.length ? (
        <button className="open-part" type="button" onClick={() => onOpen(node)}>
          Open component internals <span>→</span>
        </button>
      ) : null}

      <div className="inspector-note">
        <strong>Visual scope</strong>
        <p>
          Selecting this part can later become the Search / Context / Edit boundary for the coding agent.
          The current iteration uses a scripted exploration trace.
        </p>
      </div>

      <div className="root-summary">
        <span>case root</span>
        <strong>{root.label}</strong>
        <small>nanoGPT · model.py</small>
      </div>
    </aside>
  );
}
