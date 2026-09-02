export type WorkspaceFile = {
  path: string;
  content: string;
  language: string;
  updatedAt: number;
};

export type PersonalWorkspace = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  files: WorkspaceFile[];
};

export type AiPhase = "idle" | "inspecting" | "editing";

export type AiActivity = {
  nodeId: string;
  phase: Exclude<AiPhase, "idle">;
};

export type AiEditCandidate = {
  updatedSource: string;
  summary: string;
};
