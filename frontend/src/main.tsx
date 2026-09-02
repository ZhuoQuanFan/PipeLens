import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";

import {
  findPipeNode,
  findPipePath,
  nanoGptAgentReplay,
  nanoGptCase,
  type PipeNode,
} from "./cases/nanogpt";
import { PipeGrammarLegend } from "./game/PipeGrammarLegend";
import { PipeWorld } from "./game/PipeWorld";
import { PipeInspector } from "./views/PipeCanvas";
import { usePersonalWorkspace } from "./workspace/usePersonalWorkspace";
import type { AiActivity } from "./workspace/types";
import "./pipe.css";
import "./gameWorld.css";
import "./pipeGrammar.css";

function App() {
  const [focusId, setFocusId] = useState("block-6");
  const [selectedId, setSelectedId] = useState("ln1");
  const [activeAgentStep, setActiveAgentStep] = useState(3);
  const [aiActivity, setAiActivity] = useState<AiActivity | null>(null);
  const [inspectorWidth, setInspectorWidth] = useState(() => {
    const saved = Number(localStorage.getItem("pipelens.inspector-width"));
    return Number.isFinite(saved) && saved >= 320 ? Math.min(saved, 760) : 430;
  });
  const { workspace, workspaceError, importFiles, updateFile } = usePersonalWorkspace();

  const focus = useMemo(() => findPipeNode(nanoGptCase, focusId) ?? nanoGptCase, [focusId]);
  const selected = useMemo(() => findPipeNode(nanoGptCase, selectedId) ?? focus, [selectedId, focus]);
  const focusPath = useMemo(() => findPipePath(nanoGptCase, focus.id) ?? [nanoGptCase], [focus.id]);

  const selectNode = useCallback((node: PipeNode) => {
    setSelectedId(node.id);
  }, []);

  const openNode = useCallback((node: PipeNode) => {
    if (!node.children?.length) return;
    setFocusId(node.id);
    setSelectedId(node.children[0]?.id ?? node.id);
  }, []);

  const navigate = useCallback((node: PipeNode) => {
    setFocusId(node.id);
    setSelectedId(node.id);
  }, []);

  const selectAgentStep = useCallback((index: number) => {
    setActiveAgentStep(index);
    const step = nanoGptAgentReplay[index];
    if (!step.nodeId) return;
    setSelectedId(step.nodeId);
    const path = findPipePath(nanoGptCase, step.nodeId);
    const parent = path?.at(-2);
    if (parent) setFocusId(parent.id);
  }, []);

  const currentAgent = nanoGptAgentReplay[activeAgentStep];

  useEffect(() => {
    localStorage.setItem("pipelens.inspector-width", String(inspectorWidth));
  }, [inspectorWidth]);

  return (
    <main className="game-app" style={{ "--inspector-width": `${inspectorWidth}px` } as CSSProperties}>
      <section className="game-stage">
        <header className="game-topbar">
          <div>
            <div className="case-kicker">FAMOUS CODE CASE · karpathy/nanoGPT</div>
            <h1>PipeLens PipeWorld</h1>
            <p>
              Program execution is rendered as a live entity moving through a 2D code world. Code structure is encoded as
              different game pieces, while a hard fault physically blocks downstream flow.
            </p>
          </div>
          <div className="game-badge">game-like interaction · scientific visualization semantics</div>
        </header>

        <nav className="game-breadcrumbs" aria-label="Semantic hierarchy">
          {focusPath.map((node, index) => (
            <button type="button" key={node.id} onClick={() => navigate(node)}>
              <span>{node.level}</span>
              <strong>{node.label}</strong>
              {index < focusPath.length - 1 ? <i>›</i> : null}
            </button>
          ))}
        </nav>

        <PipeGrammarLegend />

        <PipeWorld
          focus={focus}
          selectedId={selected.id}
          agentSteps={nanoGptAgentReplay}
          activeAgentStep={activeAgentStep}
          aiActivity={aiActivity}
          onSelect={selectNode}
          onOpen={openNode}
        />

        <section className="game-agent-strip">
          <div className="game-agent-heading">
            <span>SCRIPTED AGENT REPLAY</span>
            <strong>{currentAgent.action} · {currentAgent.target}</strong>
            <p>{currentAgent.note}</p>
          </div>
          <div className="game-agent-track">
            {nanoGptAgentReplay.map((step, index) => (
              <button
                type="button"
                key={step.id}
                className={`${step.state} ${index === activeAgentStep ? "active" : ""}`}
                onClick={() => selectAgentStep(index)}
              >
                <span>{step.action}</span>
                <strong>{step.target}</strong>
              </button>
            ))}
          </div>
        </section>
      </section>

      <PipeInspector
        node={selected}
        root={nanoGptCase}
        width={inspectorWidth}
        onResize={setInspectorWidth}
        onOpen={openNode}
        workspace={workspace}
        workspaceError={workspaceError}
        onImport={importFiles}
        onUpdateFile={updateFile}
        onAiActivity={setAiActivity}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
