import { describe, expect, it } from "vitest";

import { buildArchitecturePipe, relatedReach, searchRepositoryGraph, shortestRoute, type RepositoryGraph } from "./repositoryGraph";

const graph: RepositoryGraph = {
  schema_version: 1,
  root_id: "repository:root",
  nodes: [
    { id: "repository:root", label: "Repository", kind: "repository", tags: [] },
    { id: "module:main", label: "main.py", kind: "module", language: "python", anchor: { file: "main.py", start_line: 1, end_line: 8 }, tags: [] },
    { id: "module:service", label: "service.py", kind: "module", language: "python", anchor: { file: "service.py", start_line: 1, end_line: 3 }, tags: [] },
    { id: "symbol:run", label: "run()", kind: "function", language: "python", anchor: { file: "main.py", start_line: 4, end_line: 6, symbol: "run" }, tags: [] },
    { id: "symbol:greet", label: "greet()", kind: "function", language: "python", anchor: { file: "service.py", start_line: 1, end_line: 2, symbol: "greet" }, tags: [] },
  ],
  edges: [
    { id: "e1", source: "repository:root", target: "module:main", relation: "contains", confidence: "extracted" },
    { id: "e2", source: "repository:root", target: "module:service", relation: "contains", confidence: "extracted" },
    { id: "e3", source: "module:main", target: "symbol:run", relation: "contains", confidence: "extracted" },
    { id: "e4", source: "module:service", target: "symbol:greet", relation: "contains", confidence: "extracted" },
    { id: "e5", source: "module:main", target: "module:service", relation: "imports", confidence: "inferred" },
    { id: "e6", source: "symbol:run", target: "symbol:greet", relation: "calls", confidence: "inferred" },
  ],
  summary: { files: 2, symbols: 2, imports: 1, calls: 1, external_dependencies: 0 },
  warnings: [],
};

describe("repository graph adapter", () => {
  it("preserves containment for PipeWorld drill-down and source anchors", () => {
    const root = buildArchitecturePipe(graph, { kind: "overview" });
    const main = root.children?.find((node) => node.id === "module:main");
    expect(root.label).toBe("Repository Architecture");
    expect(main?.children?.[0].anchor).toEqual({ file: "main.py", symbol: "run", line: "4-6" });
  });

  it("supports search, directed reach, and exact routes", () => {
    expect(searchRepositoryGraph(graph, "greet")[0].id).toBe("symbol:greet");
    expect(relatedReach(graph, "symbol:run", "downstream")).toEqual(["symbol:run", "symbol:greet"]);
    expect(relatedReach(graph, "symbol:greet", "upstream")).toEqual(["symbol:greet", "symbol:run"]);
    expect(shortestRoute(graph, "symbol:run", "symbol:greet")).toEqual(["symbol:run", "symbol:greet"]);
    expect(shortestRoute(graph, "symbol:greet", "module:main")).toEqual([]);
    expect(buildArchitecturePipe(graph, { kind: "route", nodeId: "symbol:greet", targetId: "module:main" }).subtitle)
      .toContain("No authored directed route");
  });
});
