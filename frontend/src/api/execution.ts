import type { PersonalWorkspace } from "../workspace/types";
import { findWorkspaceFile } from "../workspace/workspaceStore";
import type { PythonRunResult } from "../execution/types";

export async function runPythonWorkspace(workspace: PersonalWorkspace): Promise<PythonRunResult> {
  const model = findWorkspaceFile(workspace, "model.py");
  if (!model) throw new Error("The workspace does not contain model.py.");

  const response = await fetch("/api/run-python", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: workspace.id,
      file: model.path,
      source: model.content,
      nodeId: "scale",
      line: 67,
    }),
  });
  const text = await response.text();
  let payload: PythonRunResult | { error?: string };
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Python runner returned an unreadable response.");
  }
  if (!response.ok || !("status" in payload)) {
    throw new Error(("error" in payload && payload.error) || "Python verification failed to start.");
  }
  return payload;
}
