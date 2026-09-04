import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";

import {
  findPipeNode,
  findPipePath,
  nanoGptAgentReplay,
  nanoGptCase,
  type PipeNode,
} from "./cases/nanogpt";
import { debugCaseById, debugCases } from "./cases/debugCases";
import { runPythonWorkspace } from "./api/execution";
import { analyzeRepository } from "./api/repositoryGraph";
import { caseFromExecution } from "./execution/runtimeCase";
import type { ExecutionState } from "./execution/types";
import { PipeGrammarLegend } from "./game/PipeGrammarLegend";
import { PipeWorld } from "./game/PipeWorld";
import { buildArchitecturePipe, type ArchitectureView, type RepositoryGraph } from "./model/repositoryGraph";
import { ArchitectureLens } from "./views/ArchitectureLens";
import { PipeInspector } from "./views/PipeCanvas";
import { usePersonalWorkspace } from "./workspace/usePersonalWorkspace";
import type { AiActivity } from "./workspace/types";
import "./pipe.css";
import "./gameWorld.css";
import "./pipeGrammar.css";

function App() {
  const [viewMode, setViewMode] = useState<"demo" | "architecture">("demo");
  const [activeCaseId, setActiveCaseId] = useState(() => localStorage.getItem("pipelens.debug-case") ?? debugCases[0].id);
  const [focusId, setFocusId] = useState("block-6");
  const [selectedId, setSelectedId] = useState("ln1");
  const [activeAgentStep, setActiveAgentStep] = useState(3);
  const [aiActivity, setAiActivity] = useState<AiActivity | null>(null);
  const [execution, setExecution] = useState<ExecutionState>({ status: "idle", runId: "initial" });
  const [repositoryGraph, setRepositoryGraph] = useState<RepositoryGraph | null>(null);
  const [architectureStatus, setArchitectureStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [architectureError, setArchitectureError] = useState<string | null>(null);
  const [architectureView, setArchitectureView] = useState<ArchitectureView>({ kind: "overview" });
  const [architectureFocusId, setArchitectureFocusId] = useState("repository:root");
  const [architectureSelectedId, setArchitectureSelectedId] = useState<string | null>(null);
  const [trialStats, setTrialStats] = useState<TrialStats>(loadTrialStats);
  const [inspectorWidth, setInspectorWidth] = useState(() => {
    const saved = Number(localStorage.getItem("pipelens.inspector-width"));
    return Number.isFinite(saved) && saved >= 320 ? Math.min(saved, 760) : 430;
  });
  const activeCase = useMemo(() => debugCaseById(activeCaseId), [activeCaseId]);
  const { workspace, workspaceError, importFiles, updateFile, resetCase } = usePersonalWorkspace(activeCase);

  const runtimeCase = useMemo(() => caseFromExecution(nanoGptCase, execution, activeCase.errors), [activeCase, execution]);
  const architectureRoot = useMemo(
    () => repositoryGraph ? buildArchitecturePipe(repositoryGraph, architectureView) : null,
    [repositoryGraph, architectureView],
  );
  const displayedRoot = viewMode === "architecture" && architectureRoot ? architectureRoot : runtimeCase;
  const displayedFocusId = viewMode === "architecture" ? architectureFocusId : focusId;
  const displayedSelectedId = viewMode === "architecture" ? architectureSelectedId : selectedId;
  const focus = useMemo(() => findPipeNode(displayedRoot, displayedFocusId) ?? displayedRoot, [displayedFocusId, displayedRoot]);
  const selected = useMemo(() => findPipeNode(displayedRoot, displayedSelectedId ?? "") ?? focus, [displayedRoot, displayedSelectedId, focus]);
  const focusPath = useMemo(() => findPipePath(displayedRoot, focus.id) ?? [displayedRoot], [displayedRoot, focus.id]);

  const selectNode = useCallback((node: PipeNode) => {
    if (viewMode === "architecture") setArchitectureSelectedId(node.id);
    else setSelectedId(node.id);
  }, [viewMode]);

  const openNode = useCallback((node: PipeNode) => {
    if (!node.children?.length) return;
    if (viewMode === "architecture") {
      setArchitectureFocusId(node.id);
      setArchitectureSelectedId(node.children[0]?.id ?? node.id);
    } else {
      setFocusId(node.id);
      setSelectedId(node.children[0]?.id ?? node.id);
    }
  }, [viewMode]);

  const navigate = useCallback((node: PipeNode) => {
    if (viewMode === "architecture") {
      setArchitectureFocusId(node.id);
      setArchitectureSelectedId(node.id);
    } else {
      setFocusId(node.id);
      setSelectedId(node.id);
    }
  }, [viewMode]);

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
      const result = await runPythonWorkspace(workspace);
      setExecution(result);
      setTrialStats((current) => incrementStats(current, activeCase.id, result.status === "passed"));
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
      setTrialStats((current) => incrementStats(current, activeCase.id, false));
    }
  }, [activeCase.id, workspace]);

  const selectCase = useCallback((caseId: string) => {
    localStorage.setItem("pipelens.debug-case", caseId);
    setActiveCaseId(caseId);
    setExecution({ status: "idle", runId: `case-${caseId}-${Date.now()}` });
    setFocusId("attention-score");
    setSelectedId("scale");
    setActiveAgentStep(6);
  }, []);

  const resetActiveCase = useCallback(async () => {
    await resetCase();
    setExecution({ status: "idle", runId: `reset-${Date.now()}`, summary: "Faulty baseline restored for a new trial." });
    setFocusId("attention-score");
    setSelectedId("scale");
    setActiveAgentStep(6);
  }, [resetCase]);

  const updateWorkspaceFile = useCallback(async (path: string, content: string) => {
    await updateFile(path, content);
    setExecution({ status: "stale", runId: `stale-${Date.now()}`, summary: "Code changed. Restart to execute Python and refresh the pipeline." });
  }, [updateFile]);

  const currentAgent = nanoGptAgentReplay[activeAgentStep];

  const selectArchitectureNode = useCallback((nodeId: string) => {
    if (!repositoryGraph) return;
    const overview = buildArchitecturePipe(repositoryGraph, { kind: "overview" });
    const path = findPipePath(overview, nodeId);
    setArchitectureView({ kind: "overview" });
    setArchitectureSelectedId(nodeId);
    setArchitectureFocusId(path?.at(-2)?.id ?? overview.id);
  }, [repositoryGraph]);

  const changeArchitectureView = useCallback((nextView: ArchitectureView) => {
    if (!repositoryGraph) return;
    const nextRoot = buildArchitecturePipe(repositoryGraph, nextView);
    const selectedForView = nextView.kind === "route"
      ? findPipeNode(nextRoot, nextView.targetId)?.id ?? nextView.nodeId
      : nextView.kind === "overview"
        ? repositoryGraph.root_id
        : nextView.nodeId;
    setArchitectureView(nextView);
    setArchitectureFocusId(nextRoot.id);
    setArchitectureSelectedId(selectedForView);
  }, [repositoryGraph]);

  const changeViewMode = useCallback((mode: "demo" | "architecture") => {
    if (mode === "architecture" && !repositoryGraph) return;
    setViewMode(mode);
    if (mode === "architecture" && architectureRoot) {
      setArchitectureFocusId(architectureRoot.id);
      setArchitectureSelectedId((current) => current ?? architectureRoot.children?.[0]?.id ?? architectureRoot.id);
    }
  }, [architectureRoot, repositoryGraph]);

  useEffect(() => {
    localStorage.setItem("pipelens.inspector-width", String(inspectorWidth));
  }, [inspectorWidth]);

  useEffect(() => {
    localStorage.setItem("pipelens.trial-stats", JSON.stringify(trialStats));
  }, [trialStats]);

  useEffect(() => {
    if (!workspace) {
      setArchitectureStatus("idle");
      setRepositoryGraph(null);
      return;
    }
    let cancelled = false;
    setArchitectureStatus("loading");
    setArchitectureError(null);
    analyzeRepository(workspace)
      .then((graph) => {
        if (cancelled) return;
        setRepositoryGraph(graph);
        setArchitectureStatus("ready");
        setArchitectureView({ kind: "overview" });
        setArchitectureFocusId(graph.root_id);
        setArchitectureSelectedId(graph.nodes.find((node) => node.kind === "module")?.id ?? graph.root_id);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setArchitectureStatus("error");
        setArchitectureError(error instanceof Error ? error.message : "Repository analysis failed.");
      });
    return () => { cancelled = true; };
  }, [workspace]);

  return (
    <main className="game-app" style={{ "--inspector-width": `${inspectorWidth}px` } as CSSProperties}>
      <section className="game-stage">
        <header className="game-topbar">
          <div>
            <div className="case-kicker">{viewMode === "architecture" ? "SOURCE-GROUNDED REPOSITORY MAP" : "FAMOUS CODE CASE · karpathy/nanoGPT"}</div>
            <h1>{viewMode === "architecture" ? "PipeLens Architecture World" : "PipeLens PipeWorld"}</h1>
            <p>
              {viewMode === "architecture"
                ? "Modules, symbols, imports and calls are rendered with the same pipe grammar. Search the graph, drill into containment, or trace authored upstream/downstream routes."
                : "Program execution is rendered as a live entity moving through a 2D code world. Code structure is encoded as different game pieces, while a hard fault physically blocks downstream flow."}
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

        <ArchitectureLens
          active={viewMode === "architecture"}
          graph={repositoryGraph}
          status={architectureStatus}
          error={architectureError}
          selectedId={architectureSelectedId}
          view={architectureView}
          onMode={changeViewMode}
          onSelect={selectArchitectureNode}
          onView={changeArchitectureView}
        />

        {viewMode === "demo" ? <section className="debug-case-picker" aria-label="Debug cases">
          <div className="debug-case-intro">
            <span>REAL PYTHON FAULT CASES</span>
            <strong>Choose a reproducible bug</strong>
            <small>Refresh or reset restores faulty code; trial statistics are retained.</small>
          </div>
          <div className="debug-case-options">
            {debugCases.map((item, index) => {
              const stats = trialStats[item.id] ?? EMPTY_STATS;
              return <button type="button" className={item.id === activeCase.id ? "active" : ""} key={item.id} onClick={() => selectCase(item.id)}>
                <span>CASE 0{index + 1}</span><strong>{item.shortTitle}</strong><small>{item.symptom}</small>
                <i>{stats.passes} fixed · {stats.failures} failed · {stats.runs} runs</i>
              </button>;
            })}
          </div>
          <button type="button" className="reset-case" onClick={() => void resetActiveCase()}>Reset case</button>
        </section> : null}

        <PipeWorld
          focus={focus}
          selectedId={selected.id}
          agentSteps={viewMode === "demo" ? nanoGptAgentReplay : []}
          activeAgentStep={activeAgentStep}
          aiActivity={viewMode === "demo" ? aiActivity : null}
          execution={viewMode === "demo" ? execution : { status: "idle", runId: architectureRoot?.id ?? "architecture" }}
          mode={viewMode === "demo" ? "execution" : "architecture"}
          onRestart={viewMode === "demo" ? runWorkspace : async () => undefined}
          onSelect={selectNode}
          onOpen={openNode}
        />

        {viewMode === "demo" ? <section className="game-agent-strip">
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
        </section> : null}
      </section>

      <PipeInspector
        node={selected}
        root={displayedRoot}
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

type TrialStats = Record<string, { runs: number; passes: number; failures: number }>;
const EMPTY_STATS = { runs: 0, passes: 0, failures: 0 };

function loadTrialStats(): TrialStats {
  try {
    return JSON.parse(localStorage.getItem("pipelens.trial-stats") ?? "{}");
  } catch {
    return {};
  }
}

function incrementStats(stats: TrialStats, caseId: string, passed: boolean): TrialStats {
  const current = stats[caseId] ?? EMPTY_STATS;
  return { ...stats, [caseId]: { runs: current.runs + 1, passes: current.passes + (passed ? 1 : 0), failures: current.failures + (passed ? 0 : 1) } };
}
