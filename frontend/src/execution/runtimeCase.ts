import type { PipeNode } from "../cases/nanogpt";
import type { ExecutionState } from "./types";

export function caseFromExecution(root: PipeNode, execution: ExecutionState): PipeNode {
  if (!("nodeId" in execution)) return root;
  const targetStatus = execution.status === "passed" ? "healthy" : "fault";
  const targetNodeId = execution.nodeId;

  function visit(node: PipeNode): [PipeNode, boolean] {
    const children = node.children?.map(visit) ?? [];
    const containsTarget = node.id === targetNodeId || children.some(([, contains]) => contains);
    return [{
      ...node,
      status: containsTarget ? targetStatus : node.status === "fault" ? "neutral" : node.status,
      children: node.children ? children.map(([child]) => child) : undefined,
    }, containsTarget];
  }

  return visit(root)[0];
}
