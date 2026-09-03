import { nanoGptSourceWithAttentionStatement } from "./nanogptSource";

export type DebugCase = {
  id: string;
  title: string;
  shortTitle: string;
  symptom: string;
  faultyStatement: string;
  actual: number;
  expected: number;
  errors: Record<string, string>;
};

const sharedErrors = {
  "gpt-forward": "Logits unstable after Block 6",
  "transformer-stack": "Block 6 runtime verification failed",
  "block-6": "Residual receives invalid attention output",
  attention: "Manual attention normalization failed",
  "attention-score": "Attention score magnitude is out of range",
};

export const debugCases: DebugCase[] = [
  {
    id: "multiply-scale",
    title: "Multiply by √dₖ",
    shortTitle: "Reversed scaling",
    symptom: "Scores grow with head width and softmax saturates.",
    faultyStatement: "att = (q @ k.transpose(-2, -1)) * math.sqrt(k.size(-1))",
    actual: 16,
    expected: 4,
    errors: { ...sharedErrors, scale: "Expected 4 · observed 16" },
  },
  {
    id: "missing-scale",
    title: "Missing attention scale",
    shortTitle: "Scale omitted",
    symptom: "Raw dot products are passed directly into softmax.",
    faultyStatement: "att = q @ k.transpose(-2, -1)",
    actual: 8,
    expected: 4,
    errors: { ...sharedErrors, scale: "Expected 4 · observed 8" },
  },
  {
    id: "wrong-dimension",
    title: "Scale by sequence length",
    shortTitle: "Wrong dimension",
    symptom: "Scaling changes with token count instead of head width.",
    faultyStatement: "att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-2)))",
    actual: 2,
    expected: 4,
    errors: { ...sharedErrors, scale: "Expected 4 · observed 2" },
  },
];

export function debugCaseById(id: string) {
  return debugCases.find((item) => item.id === id) ?? debugCases[0];
}

export function sourceForDebugCase(debugCase: DebugCase) {
  return nanoGptSourceWithAttentionStatement(debugCase.faultyStatement);
}
