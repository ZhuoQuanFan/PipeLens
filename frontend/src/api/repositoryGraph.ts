import type { RepositoryGraph } from "../model/repositoryGraph";
import type { PersonalWorkspace } from "../workspace/types";

const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? "http://localhost:8000" : "");

export async function analyzeRepository(workspace: PersonalWorkspace): Promise<RepositoryGraph> {
  const response = await fetch(`${API_BASE}/api/analyze-repository`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: workspace.files.map((file) => ({ path: file.path, content: file.content, language: file.language })),
    }),
  });
  if (!response.ok) throw new Error(`Repository analysis failed (${response.status}). Start the PipeLens backend and retry.`);
  return response.json() as Promise<RepositoryGraph>;
}
