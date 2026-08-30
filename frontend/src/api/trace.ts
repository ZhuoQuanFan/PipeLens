import type { TraceBundle } from "../model/trace";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export async function fetchDemoTrace(): Promise<TraceBundle> {
  const response = await fetch(`${API_BASE}/api/demo-trace`);
  if (!response.ok) {
    throw new Error(`Failed to load demo trace: ${response.status}`);
  }
  return response.json() as Promise<TraceBundle>;
}
