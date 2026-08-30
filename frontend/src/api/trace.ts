import type { ProgramNode, ScopeContract, TraceBundle } from "../model/trace";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export async function fetchDemoTrace(): Promise<TraceBundle> {
  const response = await fetch(`${API_BASE}/api/demo-trace`);
  if (!response.ok) {
    throw new Error(`Failed to load demo trace: ${response.status}`);
  }
  return response.json() as Promise<TraceBundle>;
}

export async function generateScopeContract(
  selectedNodeId: string,
  programNodes: ProgramNode[],
): Promise<ScopeContract> {
  const response = await fetch(`${API_BASE}/api/scope`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selected_node_id: selectedNodeId, program_nodes: programNodes }),
  });
  if (!response.ok) {
    throw new Error(`Failed to generate scope contract: ${response.status}`);
  }
  return response.json() as Promise<ScopeContract>;
}
