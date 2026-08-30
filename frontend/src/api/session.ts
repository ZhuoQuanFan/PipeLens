import type { AgentSession, AgentSessionStartRequest } from "../model/session";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export async function createAgentSession(request: AgentSessionStartRequest): Promise<AgentSession> {
  const response = await fetch(`${API_BASE}/api/agent-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, provider: request.provider ?? "generic" }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create agent session: ${response.status}`);
  }
  return response.json() as Promise<AgentSession>;
}

export async function fetchAgentSession(sessionId: string): Promise<AgentSession> {
  const response = await fetch(`${API_BASE}/api/agent-sessions/${sessionId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch agent session: ${response.status}`);
  }
  return response.json() as Promise<AgentSession>;
}
