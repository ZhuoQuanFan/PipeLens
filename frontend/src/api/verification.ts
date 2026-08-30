import type { VerificationReport } from "../model/verification";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export async function fetchDemoVerification(selectedNodeId: string): Promise<VerificationReport> {
  const params = new URLSearchParams({ selected_node_id: selectedNodeId });
  const response = await fetch(`${API_BASE}/api/demo-verification?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to load verification evidence: ${response.status}`);
  }
  return response.json() as Promise<VerificationReport>;
}
