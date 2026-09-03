import { describe, expect, it } from "vitest";

import { findPipeNode, nanoGptCase } from "../cases/nanogpt";
import { caseFromExecution } from "./runtimeCase";

const base = {
  runId: "run-1",
  summary: "executed",
  file: "model.py",
  nodeId: "scale",
  line: 67,
  durationMs: 2,
  trace: [],
};

describe("runtime-driven pipe state", () => {
  it("clears the injected boundary after Python verification passes", () => {
    const resolved = caseFromExecution(nanoGptCase, { ...base, status: "passed" });
    expect(findPipeNode(resolved, "scale")?.status).toBe("healthy");
    expect(findPipeNode(resolved, "attention")?.status).toBe("healthy");
    expect(findPipeNode(resolved, "block-6")?.status).toBe("healthy");
  });

  it("keeps the executed statement and its pipeline ancestors red after failure", () => {
    const resolved = caseFromExecution(nanoGptCase, { ...base, status: "failed", expected: 4, actual: 16 }, { scale: "baseline" });
    expect(findPipeNode(resolved, "scale")?.status).toBe("fault");
    expect(findPipeNode(resolved, "attention")?.status).toBe("fault");
    expect(findPipeNode(resolved, "block-6")?.status).toBe("fault");
    expect(findPipeNode(resolved, "causal-mask")?.status).toBe("neutral");
    expect(findPipeNode(resolved, "scale")?.runtimeError).toBe("Expected 4 · observed 16");
  });

  it("shows configured hierarchy diagnostics before the first run", () => {
    const resolved = caseFromExecution(nanoGptCase, { status: "idle", runId: "initial" }, { "block-6": "Block failed", scale: "Expected 4 · observed 16" });
    expect(findPipeNode(resolved, "block-6")?.runtimeError).toBe("Block failed");
    expect(findPipeNode(resolved, "scale")?.runtimeError).toBe("Expected 4 · observed 16");
  });
});
