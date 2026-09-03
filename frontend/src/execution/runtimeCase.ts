import type { PipeNode } from "../cases/nanogpt";
import type { ExecutionState } from "./types";

export function caseFromExecution(root: PipeNode, execution: ExecutionState, errors: Record<string, string> = {}): PipeNode {
  const run = "nodeId" in execution ? execution : null;
  const targetStatus = run?.status === "passed" ? "healthy" : "fault";
  const targetNodeId = run?.nodeId ?? "scale";

  function visit(node: PipeNode): [PipeNode, boolean] {
    const children = node.children?.map(visit) ?? [];
    const containsTarget = node.id === targetNodeId || children.some(([, contains]) => contains);
    const status = run
      ? containsTarget ? targetStatus : node.status === "fault" ? "neutral" : node.status
      : node.status;
    const measuredError = run && node.id === targetNodeId && run.status !== "passed" && run.actual != null
      ? `Expected ${run.expected ?? "—"} · observed ${run.actual}`
      : errors[node.id];
    return [{
      ...node,
      status,
      runtimeError: status === "fault" ? measuredError : undefined,
      children: node.children ? children.map(([child]) => child) : undefined,
    }, containsTarget];
  }

  return visit(root)[0];
}
