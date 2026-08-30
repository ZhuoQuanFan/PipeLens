import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  findPipeNode,
  findPipePath,
  nanoGptAgentReplay,
  nanoGptCase,
  type PipeNode,
} from "./cases/nanogpt";
import { PipeCanvas, PipeInspector } from "./views/PipeCanvas";
import "./pipe.css";

function App() {
  const [focusId, setFocusId] = useState(nanoGptCase.id);
  const [selectedId, setSelectedId] = useState("transformer-stack");
  const [activeAgentStep, setActiveAgentStep] = useState(0);

  const focus = useMemo(
    () => findPipeNode(nanoGptCase, focusId) ?? nanoGptCase,
    [focusId],
  );
  const selected = useMemo(
    () => findPipeNode(nanoGptCase, selectedId) ?? focus,
    [selectedId, focus],
  );
  const focusPath = useMemo(
    () => findPipePath(nanoGptCase, focus.id) ?? [nanoGptCase],
    [focus.id],
  );

  function selectNode(node: PipeNode) {
    setSelectedId(node.id);
  }

  function openNode(node: PipeNode) {
    if (!node.children?.length) return;
    setFocusId(node.id);
    setSelectedId(node.children[0]?.id ?? node.id);
  }

  function navigate(node: PipeNode) {
    setFocusId(node.id);
    setSelectedId(node.id);
  }

  function selectAgentStep(index: number) {
    setActiveAgentStep(index);
    const step = nanoGptAgentReplay[index];
    if (!step.nodeId) return;
    setSelectedId(step.nodeId);

    const path = findPipePath(nanoGptCase, step.nodeId);
    if (!path?.length) return;
    const parent = path.at(-2);
    if (parent) setFocusId(parent.id);
  }

  return (
    <main className="pipe-app">
      <PipeCanvas
        root={nanoGptCase}
        focus={focus}
        path={focusPath}
        selectedId={selected.id}
        agentSteps={nanoGptAgentReplay}
        activeAgentStep={activeAgentStep}
        onSelect={selectNode}
        onNavigate={navigate}
        onAgentStep={selectAgentStep}
      />
      <PipeInspector node={selected} root={nanoGptCase} onOpen={openNode} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
