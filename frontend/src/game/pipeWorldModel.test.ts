import { describe, expect, it } from "vitest";

import { findPipeNode, nanoGptCase } from "../cases/nanogpt";
import { layoutPipeWorld } from "./pipeWorldModel";

describe("PipeWorld semantic topology", () => {
  it("lays residual connections out as bypass edges that merge at junction nodes", () => {
    const block = findPipeNode(nanoGptCase, "block-6");
    const layout = layoutPipeWorld(block?.children ?? [], block?.edges);

    expect(layout.bypassPaths.map((path) => [path.from, path.to])).toEqual([
      ["$input", "residual-1"],
      ["residual-1", "residual-2"],
    ]);
    expect(layout.nodes.find((item) => item.node.id === "residual-1")?.node.piece).toBe("junction");
    expect(layout.nodes.find((item) => item.node.id === "residual-2")?.node.piece).toBe("junction");

    layout.bypassPaths.forEach((bypass) => {
      expect(bypass.path.length).toBeGreaterThanOrEqual(4);
      expect(bypass.endDistance).toBeGreaterThan(bypass.startDistance);
    });
  });

  it("keeps linear cases backward compatible when no semantic edges are provided", () => {
    const attention = findPipeNode(nanoGptCase, "attention");
    const layout = layoutPipeWorld(attention?.children ?? []);

    expect(layout.bypassPaths).toEqual([]);
    expect(layout.nodes).toHaveLength(attention?.children?.length ?? 0);
    expect(layout.path.length).toBeGreaterThan(1);
  });
});
