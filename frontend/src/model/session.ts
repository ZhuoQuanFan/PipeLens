import type { AgentEvent, ExecutionExplorationLink, ProgramNode, ScopeContract, TraceBundle } from "./trace";

export type AgentActionDecision = {
  event: AgentEvent;
  allowed: boolean;
  reason: string;
};

export type PatchDecision = {
  accepted: boolean;
  changed_files: string[];
  changed_line_ranges: Array<{ file: string; start: number; end: number }>;
  scope_violations: Array<{ file: string; start: number; end: number; reason: string }>;
  unified_diff: string;
};

export type AgentSession = {
  id: string;
  provider: string;
  source_session_id: string;
  status: "active" | "completed";
  scope: ScopeContract;
  program_nodes: ProgramNode[];
  agent_events: AgentEvent[];
  links: ExecutionExplorationLink[];
  action_decisions: AgentActionDecision[];
  patch_decisions: PatchDecision[];
  rejected_actions: number;
  rejected_patches: number;
};

export type AgentSessionStartRequest = {
  trace: TraceBundle;
  scope: ScopeContract;
  provider?: string;
};
