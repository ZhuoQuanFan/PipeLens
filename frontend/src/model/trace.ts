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

export type AgentEvent = {
  id: string;
  timestamp: number;
  type: string;
  target?: {
    file?: string | null;
    symbol?: string | null;
    node_id?: string | null;
  } | null;
  tool?: string | null;
  observable_input?: unknown;
  observable_output?: unknown;
};

export type TraceBundle = {
  session_id: string;
  program_nodes: ProgramNode[];
  agent_events: AgentEvent[];
  links: unknown[];
};
