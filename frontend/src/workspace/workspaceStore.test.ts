import { describe, expect, it } from "vitest";

import { debugCases } from "../cases/debugCases";
import { demoWorkspace, findWorkspaceFile } from "./workspaceStore";
import type { PersonalWorkspace } from "./types";

const workspace: PersonalWorkspace = {
  id: "workspace-1",
  name: "demo",
  createdAt: 1,
  updatedAt: 1,
  files: [
    { path: "project/src/model.py", content: "print('ok')", language: "python", updatedAt: 1 },
    { path: "project/README.md", content: "demo", language: "md", updatedAt: 1 },
  ],
};

describe("personal workspace file resolution", () => {
  it("matches semantic anchors inside an uploaded directory", () => {
    expect(findWorkspaceFile(workspace, "model.py")?.path).toBe("project/src/model.py");
  });

  it("returns no file when an uploaded workspace has no matching source", () => {
    expect(findWorkspaceFile(workspace, "missing.py")).toBeUndefined();
  });

  it("creates a fresh faulty baseline for every trial", () => {
    const first = demoWorkspace(debugCases[1]);
    const second = demoWorkspace(debugCases[1]);
    expect(first.id).not.toBe(second.id);
    expect(findWorkspaceFile(first, "model.py")?.content.split("\n")[66].trim()).toBe(debugCases[1].faultyStatement);
  });
});
