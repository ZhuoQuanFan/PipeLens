import { useCallback, useEffect, useState } from "react";

import type { DebugCase } from "../cases/debugCases";
import { loadCaseWorkspace, updateWorkspaceFile, workspaceFromUpload } from "./workspaceStore";
import type { PersonalWorkspace } from "./types";

export function usePersonalWorkspace(debugCase: DebugCase) {
  const [workspace, setWorkspace] = useState<PersonalWorkspace | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setWorkspace(null);
    setWorkspaceError(null);
    loadCaseWorkspace(debugCase)
      .then((loaded) => { if (!cancelled) setWorkspace(loaded); })
      .catch((error: unknown) => { if (!cancelled) setWorkspaceError(error instanceof Error ? error.message : "Workspace unavailable"); });
    return () => { cancelled = true; };
  }, [debugCase]);

  const resetCase = useCallback(async () => {
    const reset = await loadCaseWorkspace(debugCase);
    setWorkspace(reset);
    setWorkspaceError(null);
  }, [debugCase]);

  const importFiles = useCallback(async (files: FileList) => {
    try {
      const imported = await workspaceFromUpload(files);
      setWorkspace(imported);
      setWorkspaceError(null);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Could not import workspace");
    }
  }, []);

  const updateFile = useCallback(async (path: string, content: string) => {
    if (!workspace) return;
    const updated = await updateWorkspaceFile(workspace, path, content);
    setWorkspace(updated);
  }, [workspace]);

  return { workspace, workspaceError, importFiles, updateFile, resetCase };
}
