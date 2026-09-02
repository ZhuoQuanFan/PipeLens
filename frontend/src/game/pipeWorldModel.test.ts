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
    expect(firstMerge?.ports?.sort()).toEqual(["bottom", "left", "right", "top"]);
    expect(secondMerge?.ports?.sort()).toEqual(["left", "right", "top"]);
    expect(secondBypass?.path).toHaveLength(2);
    expect(secondBypass?.path[0].x).toBe(secondBypass?.path[1].x);

    const firstMergeCenter = {
      x: (firstMerge?.x ?? 0) + (firstMerge?.width ?? 0) / 2,
      y: (firstMerge?.y ?? 0) + (firstMerge?.height ?? 0) / 2,
    };
    const mainExit = layout.path.findIndex((point) => point.x === firstMergeCenter.x && point.y === firstMergeCenter.y);
    expect(layout.path[mainExit + 1]?.x).toBeGreaterThan(firstMergeCenter.x);
    expect(secondBypass?.path[1]?.y).toBeGreaterThan(secondBypass?.path[0]?.y ?? Number.POSITIVE_INFINITY);
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

  it("lays Q, K and V out as three physical paths with two semantic merges", () => {
    const attention = findPipeNode(nanoGptCase, "attention");
    const layout = layoutPipeWorld(attention?.children ?? [], attention?.edges);
    const splitter = layout.nodes.find((item) => item.node.id === "qkv");
    const q = layout.nodes.find((item) => item.node.id === "q-heads");
    const k = layout.nodes.find((item) => item.node.id === "k-heads");
    const v = layout.nodes.find((item) => item.node.id === "v-heads");
    const score = layout.nodes.find((item) => item.node.id === "attention-score");
    const values = layout.nodes.find((item) => item.node.id === "weighted-value");

    expect(layout.branchPaths.map((branch) => branch.id)).toEqual(["branch:k", "branch:v"]);
    expect(new Set([q?.y, k?.y, v?.y]).size).toBe(3);
    expect(q?.x).toBeGreaterThan(splitter?.x ?? Number.POSITIVE_INFINITY);
    expect(score?.ports?.sort()).toEqual(["left", "right", "top"]);
    expect(values?.ports?.sort()).toEqual(["bottom", "left", "right"]);
    layout.branchPaths.forEach((branch) => {
      expect(branch.endDistance).toBeGreaterThan(branch.startDistance);
    });
  });
});
