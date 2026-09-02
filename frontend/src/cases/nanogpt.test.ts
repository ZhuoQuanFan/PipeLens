import { describe, expect, it } from "vitest";

import { findPipeNode, nanoGptCase } from "./nanogpt";

describe("nanoGPT hard-stop replay", () => {
  it("marks only the reached fault boundary as fault and leaves downstream nodes neutral", () => {
    expect(findPipeNode(nanoGptCase, "attention")?.status).toBe("fault");
    expect(findPipeNode(nanoGptCase, "attention-score")?.status).toBe("fault");
    expect(findPipeNode(nanoGptCase, "scale")?.status).toBe("fault");

    [
      "causal-mask",
      "softmax",
      "weighted-value",
      "output-proj",
      "residual-1",
      "ln2",
      "mlp",
      "residual-2",
      "block-7",
      "block-11",
      "final-ln",
      "lm-head",
      "logits",
    ].forEach((nodeId) => {
      expect(findPipeNode(nanoGptCase, nodeId)?.status, nodeId).toBe("neutral");
    });
  });

  it("preserves observed healthy execution before the injected fault", () => {
    ["wte", "block-0", "block-5", "ln1", "qkv", "q-heads", "k-heads", "v-heads", "qk-matmul"].forEach((nodeId) => {
      expect(findPipeNode(nanoGptCase, nodeId)?.status, nodeId).toBe("healthy");
    });
  });
});
