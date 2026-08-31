import { useCallback, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  findPipeNode,
  findPipePath,
  nanoGptAgentReplay,
  nanoGptCase,
  type PipeNode,
} from "./cases/nanogpt";
import { PipeWorld } from "./game/PipeWorld";
import { PipeInspector } from "./views/PipeCanvas";
import "./pipe.css";
import "./gameWorld.css";

function App() {
  const [focusId, setFocusId] = useState("block-6");
  const [selectedId, setSelectedId] = useState("ln1");
  const [activeAgentStep, setActiveAgentStep] = useState(3);

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

  return (
    <main className="game-app">
      <section className="game-stage">
        <header className="game-topbar">
          <div>
            <div className="case-kicker">FAMOUS CODE CASE · karpathy/nanoGPT</div>
            <h1>PipeLens PipeWorld</h1>
            <p>
              Program execution is rendered as a live entity moving through a 2D code world. The camera follows execution,
              components can be entered like game objects, and a hard fault physically blocks downstream flow.
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

        <PipeWorld
          focus={focus}
          selectedId={selected.id}
          agentSteps={nanoGptAgentReplay}
          activeAgentStep={activeAgentStep}
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

      <PipeInspector node={selected} root={nanoGptCase} onOpen={openNode} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
