import { useEffect, useMemo, useState } from "react";

import { fetchDemoVerification } from "../api/verification";
import type { VerificationReport } from "../model/verification";
import "../m5.css";

export function VerificationPanel({ selectedNodeId }: { selectedNodeId?: string }) {
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedNodeId) {
      setReport(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDemoVerification(selectedNodeId)
      .then((result) => {
        if (!cancelled) setReport(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to verify patch");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedNodeId]);

  const changedExecution = useMemo(
    () => report?.execution_diffs.filter((item) => item.changed) ?? [],
    [report],
  );

  return (
    <section className="panel verification-panel">
      <div className="panel-heading compact">
        <div>
          <h2>Execution-Aware Verification</h2>
          <p>Real pytest outcomes, runtime changes, code diff, and edit-scope compliance.</p>
        </div>
        {report ? (
          <div className={`verification-status ${report.improved && report.scope_compliant ? "ok" : "warn"}`}>
            {report.improved ? "tests improved" : "no improvement"} · {report.scope_compliant ? "scope respected" : "scope violated"}
          </div>
        ) : null}
      </div>

      {loading ? <div className="verification-empty">Running verification…</div> : null}
      {error ? <div className="verification-empty">{error}</div> : null}
      {!loading && !error && !report ? <div className="verification-empty">Select a visual program scope to verify the demo patch.</div> : null}

      {report ? (
        <>
          <div className="verification-grid">
            <TestCard label="Before patch" summary={report.before_tests} tone="before" />
            <div className="verification-arrow">→</div>
            <TestCard label="After patch" summary={report.after_tests} tone="after" />
          </div>

          <div className="verification-evidence-grid">
            <div className="verification-evidence-card">
              <span>Changed code</span>
              <strong>{formatRanges(report)}</strong>
              <small>{report.changed_files.length} file(s) changed</small>
            </div>
            <div className="verification-evidence-card">
              <span>Runtime impact</span>
              <strong>{changedExecution.length} function output(s) changed</strong>
              <small>{changedExecution.map((item) => item.function).join(", ") || "No output change"}</small>
            </div>
            <div className={`verification-evidence-card ${report.scope_compliant ? "scope-ok" : "scope-violation"}`}>
              <span>Edit-scope check</span>
              <strong>{report.scope_compliant ? "Within visual scope" : `${report.scope_violations.length} violation(s)`}</strong>
              <small>{report.scope_compliant ? report.selected_node_id : report.scope_violations.map((item) => `${item.file}:${item.start}-${item.end}`).join(", ")}</small>
            </div>
          </div>

          <details className="verification-details">
            <summary>Inspect code and runtime diff</summary>
            <div className="runtime-diff-list">
              {changedExecution.map((item) => (
                <div key={item.function} className="runtime-diff-row">
                  <strong>{item.function}</strong>
                  <code>{formatValue(item.before_output)}</code>
                  <span>→</span>
                  <code>{formatValue(item.after_output)}</code>
                </div>
              ))}
            </div>
            <pre className="code-diff">{report.unified_diff || "No source diff"}</pre>
          </details>
        </>
      ) : null}
    </section>
  );
}

function TestCard({ label, summary, tone }: { label: string; summary: VerificationReport["before_tests"]; tone: "before" | "after" }) {
  return (
    <div className={`verification-card ${tone}`}>
      <span>{label}</span>
      <strong>{summary.passed} / {summary.total} tests passed</strong>
      <small>{summary.failed} failed · {Math.round(summary.duration_ms)} ms</small>
      {summary.failing_tests.length ? <small>{summary.failing_tests.join(", ")}</small> : null}
    </div>
  );
}

function formatRanges(report: VerificationReport) {
  return report.changed_line_ranges.map((range) => `${range.file}:${range.start}-${range.end}`).join(", ") || "No source changes";
}

function formatValue(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
