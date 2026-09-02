import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";

import {
  findPipeNode,
  findPipePath,
  nanoGptAgentReplay,
  nanoGptCase,
  type PipeNode,
} from "./cases/nanogpt";
import { runPythonWorkspace } from "./api/execution";
import { caseFromExecution } from "./execution/runtimeCase";
import type { ExecutionState } from "./execution/types";
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
  const [execution, setExecution] = useState<ExecutionState>({ status: "idle", runId: "initial" });
  const [inspectorWidth, setInspectorWidth] = useState(() => {
    const saved = Number(localStorage.getItem("pipelens.inspector-width"));
    return Number.isFinite(saved) && saved >= 320 ? Math.min(saved, 760) : 430;
  });
  const { workspace, workspaceError, importFiles, updateFile } = usePersonalWorkspace();

  const runtimeCase = useMemo(() => caseFromExecution(nanoGptCase, execution), [execution]);
  const focus = useMemo(() => findPipeNode(runtimeCase, focusId) ?? runtimeCase, [focusId, runtimeCase]);
  const selected = useMemo(() => findPipeNode(runtimeCase, selectedId) ?? focus, [selectedId, focus, runtimeCase]);
  const focusPath = useMemo(() => findPipePath(runtimeCase, focus.id) ?? [runtimeCase], [focus.id, runtimeCase]);

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
    const path = findPipePath(runtimeCase, step.nodeId);
    const parent = path?.at(-2);
    if (parent) setFocusId(parent.id);
  }, [runtimeCase]);

  const runWorkspace = useCallback(async () => {
    if (!workspace) {
      setExecution({ status: "error", runId: `missing-${Date.now()}`, summary: "Upload a Python workspace before running.", file: "model.py", nodeId: "scale", line: 67, durationMs: 0, trace: [] });
      return;
    }
    const pendingId = `pending-${Date.now()}`;
    setExecution({ status: "running", runId: pendingId, summary: "Executing model.py:L67 with Python…" });
    try {
      setExecution(await runPythonWorkspace(workspace));
    } catch (error) {
      setExecution({
        status: "error",
        runId: `error-${Date.now()}`,
        summary: error instanceof Error ? error.message : "Python verification failed.",
        file: "model.py",
        nodeId: "scale",
        line: 67,
        durationMs: 0,
        trace: [],
      });
    }
  }, [workspace]);

  const updateWorkspaceFile = useCallback(async (path: string, content: string) => {
    await updateFile(path, content);
    setExecution({ status: "stale", runId: `stale-${Date.now()}`, summary: "Code changed. Restart to execute Python and refresh the pipeline." });
  }, [updateFile]);

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
          execution={execution}
          onRestart={runWorkspace}
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
        root={runtimeCase}
        width={inspectorWidth}
        onResize={setInspectorWidth}
        onOpen={openNode}
        workspace={workspace}
        workspaceError={workspaceError}
        onImport={importFiles}
        onUpdateFile={updateWorkspaceFile}
        onAiActivity={setAiActivity}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
