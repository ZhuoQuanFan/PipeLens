import type { LineRange } from "./trace";

export type TestSummary = {
  passed: number;
  failed: number;
  total: number;
  exit_code: number;
  duration_ms: number;
  failing_tests: string[];
};

export type ExecutionDiff = {
  function: string;
  before_output: unknown;
  after_output: unknown;
  changed: boolean;
};

export type ScopeViolation = {
  file: string;
  start: number;
  end: number;
  reason: string;
};

export type VerificationReport = {
  selected_node_id: string;
  before_tests: TestSummary;
  after_tests: TestSummary;
  changed_files: string[];
  changed_line_ranges: LineRange[];
  scope_violations: ScopeViolation[];
  execution_diffs: ExecutionDiff[];
  unified_diff: string;
  scope_compliant: boolean;
  improved: boolean;
};
