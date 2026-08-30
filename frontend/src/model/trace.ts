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
  dataflow_inputs: string[];
  dataflow_outputs: string[];
  expression?: string | null;
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

export type LineRange = {
  file: string;
  start: number;
  end: number;
};

export type ScopeContract = {
  selected_node_id: string;
  search_node_ids: string[];
  search_files: string[];
  context_node_ids: string[];
  include_runtime_values: boolean;
  include_tests: boolean;
  edit_files: string[];
  edit_line_ranges: LineRange[];
};

export type TraceBundle = {
  session_id: string;
  program_nodes: ProgramNode[];
  agent_events: AgentEvent[];
  links: ExecutionExplorationLink[];
};
