import { describe, expect, it } from "vitest";

import { debugCases, sourceForDebugCase } from "./debugCases";

describe("reproducible debug cases", () => {
  it("provides three distinct faulty Python statements", () => {
    expect(debugCases).toHaveLength(3);
    expect(new Set(debugCases.map((item) => item.faultyStatement)).size).toBe(3);
    debugCases.forEach((item) => {
      expect(sourceForDebugCase(item).split("\n")[66].trim()).toBe(item.faultyStatement);
      expect(item.actual).not.toBe(item.expected);
      expect(item.errors.scale).toContain(`observed ${item.actual}`);
    });
  });
});
