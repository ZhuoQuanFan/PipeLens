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
      expect(bypass.path.length).toBeGreaterThanOrEqual(bypass.from === "$input" ? 4 : 2);
      expect(bypass.endDistance).toBeGreaterThan(bypass.startDistance);
    });

    const firstMerge = layout.nodes.find((item) => item.node.id === "residual-1");
    const secondMerge = layout.nodes.find((item) => item.node.id === "residual-2");
    const secondBypass = layout.bypassPaths.find((item) => item.from === "residual-1");
    expect(firstMerge?.x).toBe(secondMerge?.x);
    expect(secondBypass?.path).toHaveLength(2);
    expect(secondBypass?.path[0].x).toBe(secondBypass?.path[1].x);
  });

  it("keeps linear cases backward compatible when no semantic edges are provided", () => {
    const attention = findPipeNode(nanoGptCase, "attention");
    const layout = layoutPipeWorld(attention?.children ?? []);

    expect(layout.bypassPaths).toEqual([]);
    expect(layout.nodes).toHaveLength(attention?.children?.length ?? 0);
    expect(layout.path.length).toBeGreaterThan(1);
  });

  it("lays parallel embedding computations out as branches that share a merge junction", () => {
    const embedding = findPipeNode(nanoGptCase, "token-position-embedding");
    const layout = layoutPipeWorld(embedding?.children ?? [], embedding?.edges);
    const token = layout.nodes.find((item) => item.node.id === "wte");
    const position = layout.nodes.find((item) => item.node.id === "wpe");
    const merge = layout.nodes.find((item) => item.node.id === "embed-add");

    expect(layout.branchPaths).toHaveLength(1);
    expect(token?.y).not.toBe(position?.y);
    expect(token?.x).toBe(position?.x);
    expect(merge?.x).toBeGreaterThan(token?.x ?? Number.POSITIVE_INFINITY);
    expect(merge?.node.piece).toBe("junction");
    expect(token?.flowDistance).toBe(position?.flowDistance);
  });
});
