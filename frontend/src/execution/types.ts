export type PythonTraceEvent = {
  file: string;
  line: number;
  event: "line" | "assertion" | "exception";
  status: "healthy" | "fault";
  value?: string;
};

export type PythonRunResult = {
  runId: string;
  status: "passed" | "failed" | "error";
  summary: string;
  file: string;
  nodeId: string;
  line: number;
  durationMs: number;
  expected?: number;
  actual?: number;
  trace: PythonTraceEvent[];
};

export type ExecutionState =
  | { status: "idle" | "stale" | "running"; runId: string; summary?: string }
  | PythonRunResult;
