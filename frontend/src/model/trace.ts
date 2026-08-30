export type DisclosureLevel = "behavior" | "logic" | "function" | "dataflow" | "statement";

export type RuntimeEvidence = {
  executed: boolean;
  start_time?: number | null;
  end_time?: number | null;
  input_values: Record<string, unknown>;
  output_values: Record<string, unknown>;
  exception?: string | null;
};

export type ProgramNode = {
  id: string;
  label: string;
  level: DisclosureLevel;
  parent_id?: string | null;
  file?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  children: string[];
  incoming: string[];
  outgoing: string[];
  runtime: RuntimeEvidence;
};

export type AgentEventType =
  | "search"
  | "open_file"
  | "symbol_lookup"
  | "inspect_function"
  | "run_test"
  | "backtrack"
  | "patch"
  | "execute";

export type AgentEvent = {
  id: string;
  timestamp: number;
  type: AgentEventType;
  target?: {
    file?: string | null;
    symbol?: string | null;
    node_id?: string | null;
  } | null;
  tool?: string | null;
  observable_input?: unknown;
  observable_output?: unknown;
};

export type ExecutionExplorationLink = {
  execution_node_id: string;
  agent_event_id: string;
  relation: "exact" | "ancestor" | "dependency" | "candidate";
  confidence?: number | null;
};

export type TraceBundle = {
  session_id: string;
  program_nodes: ProgramNode[];
  agent_events: AgentEvent[];
  links: ExecutionExplorationLink[];
};
