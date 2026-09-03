import { useEffect, useMemo, useState } from "react";

import type { PipeNode, ScriptedAgentStep } from "../cases/nanogpt";
import { SourceCodePanel } from "../game/SourceCodePanel";
import type { AiActivity, PersonalWorkspace } from "../workspace/types";

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

type FlowPhase = "future" | "active" | "passed";
type IndexedNode = { node: PipeNode; index: number };

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
  const viewportWidth = useViewportWidth();
  const itemsPerRow = useMemo(
    () => chooseItemsPerRow(viewportWidth, visible.length),
    [viewportWidth, visible.length],
  );
  const rows = useMemo(() => chunkIndexed(visible, itemsPerRow), [visible, itemsPerRow]);
  const faultIndex = useMemo(() => visible.findIndex((node) => node.status === "fault"), [visible]);
  const stopIndex = faultIndex >= 0 ? faultIndex : visible.length;
  const [flowIndex, setFlowIndex] = useState(-1);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    setFlowIndex(-1);
    setPlaying(true);
  }, [focus.id]);

  useEffect(() => {
    if (!playing) return;
    const interval = window.setInterval(() => {
      setFlowIndex((current) => Math.min(current + 1, stopIndex));
    }, Math.max(180, 900 / speed));
    return () => window.clearInterval(interval);
  }, [playing, speed, stopIndex]);

  useEffect(() => {
    if (flowIndex >= stopIndex && playing) setPlaying(false);
  }, [flowIndex, playing, stopIndex]);

  const faultBlocked = faultIndex >= 0 && flowIndex >= faultIndex;
  const activeNode = flowIndex >= 0 && flowIndex < visible.length ? visible[flowIndex] : undefined;
  const currentLabel = flowIndex < 0
    ? "source"
    : faultBlocked
      ? `BLOCKED · ${visible[faultIndex]?.label ?? "fault"}`
      : flowIndex >= visible.length
        ? "output"
        : activeNode?.label ?? "flow";

  function restartFlow() {
    setFlowIndex(-1);
    setPlaying(true);
  }

  function toggleFlow() {
    if (faultBlocked) {
      restartFlow();
      return;
    }
    setPlaying((value) => !value);
  }

  return (
    <section className="pipe-stage" aria-label="Code pipeline visualization">
      <header className="pipe-stage-header">
        <div>
          <div className="case-kicker">FAMOUS CODE CASE · karpathy/nanoGPT</div>
          <h1>Watch code flow through an expandable pipe network</h1>
          <p>
            Execution fills the code pipe piece by piece. Healthy execution is blue. When execution
            reaches the first failing component, the pipe blocks there and downstream components remain unfilled.
          </p>
        </div>
        <div className="case-badge">hard-stop fault replay · original nanoGPT is not modified</div>
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

      <div className="pipe-viewport canal-mode">
        <div className="flow-toolbar">
          <div className={`flow-live ${faultBlocked ? "blocked" : ""}`}>
            <i className={faultBlocked ? "live-dot blocked" : playing ? "live-dot running" : "live-dot"} />
            <div><span>{faultBlocked ? "FLOW BLOCKED" : "CODE FLOW"}</span><strong>{currentLabel}</strong></div>
          </div>
          <div className="flow-controls">
            <span className="layout-density">{itemsPerRow}/row</span>
            <button type="button" onClick={toggleFlow}>{faultBlocked ? "Replay" : playing ? "Pause" : "Play"}</button>
            <button type="button" onClick={restartFlow}>Restart</button>
            <label>
              speed
              <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
                <option value={0.6}>0.6×</option>
                <option value={1}>1×</option>
                <option value={1.8}>1.8×</option>
                <option value={3}>3×</option>
              </select>
            </label>
          </div>
        </div>

        <div className="pipe-legend canal-legend">
          <span><i className="legend-line healthy" />normal flow</span>
          <span><i className="legend-line fault" />fault boundary</span>
          <span><i className="legend-line empty" />not executed</span>
          <span><i className="legend-agent" />agent inspection</span>
        </div>

        <div className={`canal-board rows-${rows.length}`}>
          {rows.map((row, rowIndex) => {
            const reverse = rowIndex % 2 === 1;
            const lastRow = rowIndex === rows.length - 1;
            const nextRow = rows[rowIndex + 1];
            return (
              <div className="canal-row-wrap" key={`row-${rowIndex}`}>
                <div className={`canal-row ${reverse ? "reverse" : "forward"}`}>
                  {rowIndex === 0 ? <Terminal label={path.length === 1 ? "TOKENS" : "IN"} status="healthy" flowing={flowIndex >= -1} /> : null}
                  {row.map(({ node, index }) => (
                    <div className="canal-step" key={node.id}>
                      <FlowPipe
                        phase={phaseForStep(flowIndex, index)}
                        status={node.status}
                        reverse={reverse}
                      />
                      <Part
                        node={node}
                        selected={node.id === selectedId}
                        agentActive={agentSteps[activeAgentStep]?.nodeId === node.id}
                        flowPhase={phaseForStep(flowIndex, index)}
                        onClick={() => onSelect(node)}
                      />
                    </div>
                  ))}
                  {lastRow ? (
                    <>
                      <FlowPipe
                        phase={phaseForStep(flowIndex, visible.length)}
                        status={visible.at(-1)?.status ?? focus.status}
                        reverse={reverse}
                      />
                      <Terminal label={path.length === 1 ? "LOGITS" : "OUT"} status={visible.at(-1)?.status ?? focus.status} flowing={flowIndex >= visible.length} />
                    </>
                  ) : null}
                </div>
                {!lastRow && nextRow ? (
                  <FlowTurn
                    side={reverse ? "left" : "right"}
                    phase={phaseForStep(flowIndex, nextRow[0].index)}
                    status={nextRow[0].node.status}
                    reverseNext={!reverse}
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        {faultBlocked ? (
          <div className="fault-stop-callout">
            <strong>Execution stopped at {visible[faultIndex]?.label}</strong>
            <span>Downstream code is not executed. Open the red component to inspect the smaller pipe network inside it.</span>
          </div>
        ) : null}

        <div className="flow-progress">
          <span className={faultBlocked ? "blocked" : ""} style={{ width: `${Math.max(0, Math.min(100, ((flowIndex + 1) / (visible.length + 1)) * 100))}%` }} />
        </div>
        <div className="drill-hint">
          <span>↳</span>
          {focus.children?.length
            ? `${focus.label} contains ${focus.children.length} parts. Click any component to open its internal pipe network.`
            : "Lowest visible semantic unit. Use the inspector to view the source anchor."}
        </div>
      </div>

      <AgentReplay steps={agentSteps} active={activeAgentStep} onStep={onAgentStep} />
    </section>
  );
}

function useViewportWidth() {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1440 : window.innerWidth));

  useEffect(() => {
    let frame = 0;
    const handleResize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setWidth(window.innerWidth));
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return width;
}

function chooseItemsPerRow(width: number, nodeCount: number) {
  let capacity = 4;
  if (width >= 3000) capacity = 8;
  else if (width >= 2300) capacity = 7;
  else if (width >= 1700) capacity = 6;
  else if (width >= 1380) capacity = 5;
  else if (width < 1050) capacity = 3;

  capacity = Math.max(1, Math.min(capacity, nodeCount));
  if (nodeCount === 12 && capacity >= 6) return 6;
  if (nodeCount > capacity && nodeCount % capacity === 1 && capacity > 3) return capacity - 1;
  return capacity;
}

function chunkIndexed(nodes: PipeNode[], size: number): IndexedNode[][] {
  const indexed = nodes.map((node, index) => ({ node, index }));
  const rows: IndexedNode[][] = [];
  for (let start = 0; start < indexed.length; start += size) rows.push(indexed.slice(start, start + size));
  return rows;
}

function phaseForStep(flowIndex: number, step: number): FlowPhase {
  if (flowIndex > step) return "passed";
  if (flowIndex === step) return "active";
  return "future";
}

function FlowPipe({ phase, status, reverse }: { phase: FlowPhase; status: PipeNode["status"]; reverse?: boolean }) {
  return (
    <div className={`flow-pipe horizontal ${phase} ${status === "fault" ? "fault" : "healthy"} ${reverse ? "reverse" : ""}`}>
      <i />
    </div>
  );
}

function FlowTurn({
  side,
  phase,
  status,
  reverseNext,
}: {
  side: "left" | "right";
  phase: FlowPhase;
  status: PipeNode["status"];
  reverseNext: boolean;
}) {
  return (
    <div className={`flow-turn ${side} ${phase} ${status === "fault" ? "fault" : "healthy"} ${reverseNext ? "reverse-next" : ""}`}>
      <div className="turn-vertical"><i /></div>
      <div className="turn-elbow top"><i /></div>
      <div className="turn-elbow bottom"><i /></div>
    </div>
  );
}

function Terminal({
  label,
  status,
  flowing,
}: {
  label: string;
  status: PipeNode["status"];
  flowing: boolean;
}) {
  return (
    <div className={`canal-terminal ${status === "fault" ? "fault" : "healthy"} ${flowing ? "flowing" : ""}`}>
      <div className="terminal-gauge"><i /></div>
      <strong>{label}</strong>
    </div>
  );
}

function Part({
  node,
  selected,
  agentActive,
  flowPhase,
  onClick,
}: {
  node: PipeNode;
  selected: boolean;
  agentActive: boolean;
  flowPhase: FlowPhase;
  onClick: () => void;
}) {
  const expandable = Boolean(node.children?.length);
  return (
    <button
      type="button"
      className={`pipe-component ${node.status} ${flowPhase} ${selected ? "selected" : ""} ${agentActive ? "agent-active" : ""}`}
      onClick={onClick}
      title={expandable ? `Open ${node.label}` : node.anchor?.source ?? node.label}
    >
      <span className="component-bolt tl" /><span className="component-bolt tr" />
      <span className="component-bolt bl" /><span className="component-bolt br" />
      <span className="component-level">{node.level}</span>
      <strong>{node.label}</strong>
      {node.subtitle ? <small>{node.subtitle}</small> : null}
      <div className="component-flow-window"><i /></div>
      {expandable ? <span className="component-expand">open ×{node.children?.length}</span> : <span className="component-expand leaf">source</span>}
      {node.status === "fault" && flowPhase !== "future" ? <span className="fault-flag">!</span> : null}
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
          <button type="button" key={step.id} onClick={() => onStep(index)} className={`${step.state} ${index === active ? "active" : ""}`}>
            <i>{index + 1}</i><span>{step.action}</span><strong>{step.target}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

type InspectorProps = {
  node: PipeNode;
  root: PipeNode;
  width: number;
  workspace: PersonalWorkspace | null;
  workspaceError: string | null;
  onResize: (width: number) => void;
  onOpen: (node: PipeNode) => void;
  onImport: (files: FileList) => Promise<void>;
  onUpdateFile: (path: string, content: string) => Promise<void>;
  onAiActivity: (activity: AiActivity | null) => void;
};

export function PipeInspector({
  node,
  root,
  width,
  workspace,
  workspaceError,
  onResize,
  onOpen,
  onImport,
  onUpdateFile,
  onAiActivity,
}: InspectorProps) {
  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    if (window.innerWidth <= 980) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = width;
    const handleMove = (moveEvent: PointerEvent) => onResize(clampInspector(startWidth + startX - moveEvent.clientX));
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function resizeWithKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    onResize(clampInspector(width + (event.key === "ArrowLeft" ? 24 : -24)));
  }

  return (
    <aside className="pipe-inspector">
      <div
        className="inspector-resizer"
        role="separator"
        aria-label="Resize source inspector"
        aria-orientation="vertical"
        aria-valuemin={320}
        aria-valuemax={760}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={resizeWithKeyboard}
      />
      <div className="inspector-eyebrow">SELECTED PART</div>
      <h2>{node.label}</h2>
      <div className={`inspector-state ${node.status}`}><i />{node.status === "fault" ? "fault boundary" : node.status === "healthy" ? "normal path" : "structural"}</div>
      {node.runtimeError ? <div className="inspector-runtime-error"><strong>Runtime error</strong><span>{node.runtimeError}</span></div> : null}
      <dl>
        <div><dt>semantic level</dt><dd>{node.level}</dd></div>
        <div><dt>source</dt><dd>{node.anchor?.file ?? "—"}</dd></div>
        <div><dt>symbol</dt><dd>{node.anchor?.symbol ?? "—"}</dd></div>
      </dl>
      {node.children?.length ? <button className="open-part" type="button" onClick={() => onOpen(node)}>Open component internals <span>→</span></button> : null}
      <SourceCodePanel
        node={node}
        workspace={workspace}
        workspaceError={workspaceError}
        onImport={onImport}
        onUpdateFile={onUpdateFile}
        onAiActivity={onAiActivity}
      />
      <div className="inspector-note">
        <strong>Code-linked scope</strong>
        <p>Every selected pipe part maps to the highlighted source range above. This range is also the Search / Context / Edit boundary for the coding agent.</p>
      </div>
      <div className="root-summary"><span>case root</span><strong>{root.label}</strong><small>nanoGPT · model.py</small></div>
    </aside>
  );
}

function clampInspector(width: number) {
  return Math.max(320, Math.min(760, window.innerWidth - 520, width));
}
