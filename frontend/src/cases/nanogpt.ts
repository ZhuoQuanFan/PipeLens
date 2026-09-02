export type PipeStatus = "healthy" | "fault" | "neutral";
export type PipeLevel = "behavior" | "logic" | "function" | "dataflow" | "statement";
export type PipePiece =
  | "straight"
  | "valve"
  | "machine"
  | "splitter"
  | "junction"
  | "bypass"
  | "loop"
  | "blocked";

export type PipeEdgeKind = "sequence" | "bypass" | "branch";

export type PipeEdge = {
  id: string;
  from: string | "$input";
  to: string | "$output";
  kind: PipeEdgeKind;
};

export type CodeAnchor = {
  file: string;
  symbol?: string;
  line?: string;
  source?: string;
};

export type PipeNode = {
  id: string;
  label: string;
  subtitle?: string;
  level: PipeLevel;
  status: PipeStatus;
  piece?: PipePiece;
  anchor?: CodeAnchor;
  children?: PipeNode[];
  edges?: PipeEdge[];
};

export type ScriptedAgentStep = {
  id: string;
  action: "search" | "open" | "inspect" | "test" | "backtrack" | "patch";
  target: string;
  nodeId?: string;
  state: "visited" | "gap" | "aligned" | "pending";
  note: string;
};

const transformerBlock = (index: number): PipeNode => ({
  id: `block-${index}`,
  label: `Block ${index}`,
  level: "function",
  status: index < 6 ? "healthy" : "neutral",
  piece: "machine",
  anchor: { file: "model.py", symbol: "Block.forward", line: "103-106" },
});

const faultBlock: PipeNode = {
  id: "block-6",
  label: "Block 6",
  subtitle: "fault-localized replay",
  level: "function",
  status: "fault",
  piece: "machine",
  anchor: { file: "model.py", symbol: "Block.forward", line: "103-106", source: "x = x + self.attn(self.ln_1(x))" },
  edges: [
    { id: "block-input-ln1", from: "$input", to: "ln1", kind: "sequence" },
    { id: "ln1-attention", from: "ln1", to: "attention", kind: "sequence" },
    { id: "attention-residual-1", from: "attention", to: "residual-1", kind: "sequence" },
    { id: "residual-bypass-1", from: "$input", to: "residual-1", kind: "bypass" },
    { id: "residual-1-ln2", from: "residual-1", to: "ln2", kind: "sequence" },
    { id: "ln2-mlp", from: "ln2", to: "mlp", kind: "sequence" },
    { id: "mlp-residual-2", from: "mlp", to: "residual-2", kind: "sequence" },
    { id: "residual-bypass-2", from: "residual-1", to: "residual-2", kind: "bypass" },
    { id: "residual-2-output", from: "residual-2", to: "$output", kind: "sequence" },
  ],
  children: [
    { id: "ln1", label: "LayerNorm 1", level: "logic", status: "healthy", piece: "valve", anchor: { file: "model.py", symbol: "LayerNorm.forward", line: "26-27" } },
    {
      id: "attention",
      label: "CausalSelfAttention",
      level: "logic",
      status: "fault",
      piece: "machine",
      anchor: { file: "model.py", symbol: "CausalSelfAttention.forward", line: "52-76" },
      edges: [
        { id: "attention-input-qkv", from: "$input", to: "qkv", kind: "sequence" },
        { id: "qkv-q-heads", from: "qkv", to: "q-heads", kind: "branch" },
        { id: "qkv-k-heads", from: "qkv", to: "k-heads", kind: "branch" },
        { id: "qkv-v-heads", from: "qkv", to: "v-heads", kind: "branch" },
        { id: "q-score", from: "q-heads", to: "attention-score", kind: "branch" },
        { id: "k-score", from: "k-heads", to: "attention-score", kind: "branch" },
        { id: "score-values", from: "attention-score", to: "weighted-value", kind: "branch" },
        { id: "v-values", from: "v-heads", to: "weighted-value", kind: "branch" },
        { id: "values-output", from: "weighted-value", to: "output-proj", kind: "sequence" },
        { id: "attention-output", from: "output-proj", to: "$output", kind: "sequence" },
      ],
      children: [
        { id: "qkv", label: "Q / K / V projection", level: "function", status: "healthy", piece: "splitter", anchor: { file: "model.py", line: "56", source: "q, k, v = self.c_attn(x).split(...)" } },
        { id: "q-heads", label: "Q heads", level: "dataflow", status: "healthy", piece: "straight", anchor: { file: "model.py", line: "58", source: "q.view(...).transpose(1, 2)" } },
        { id: "k-heads", label: "K heads", level: "dataflow", status: "healthy", piece: "straight", anchor: { file: "model.py", line: "57", source: "k.view(...).transpose(1, 2)" } },
        { id: "v-heads", label: "V heads", level: "dataflow", status: "healthy", piece: "straight", anchor: { file: "model.py", line: "59", source: "v.view(...).transpose(1, 2)" } },
        {
          id: "attention-score",
          label: "Attention scores",
          level: "dataflow",
          status: "fault",
          piece: "junction",
          anchor: { file: "model.py", line: "67-71", source: "att = (q @ k.transpose(-2, -1)) * scale" },
          children: [
            { id: "qk-matmul", label: "q @ kᵀ", level: "statement", status: "healthy", piece: "junction", anchor: { file: "model.py", line: "67", source: "q @ k.transpose(-2, -1)" } },
            {
              id: "scale",
              label: "Scale by √dₖ",
              subtitle: "fault injected for demo",
              level: "statement",
              status: "fault",
              piece: "blocked",
              anchor: { file: "model.py", line: "67", source: "* (1.0 / math.sqrt(k.size(-1)))" },
            },
            { id: "causal-mask", label: "Causal mask", level: "statement", status: "neutral", piece: "valve", anchor: { file: "model.py", line: "68", source: "att.masked_fill(..., -inf)" } },
            { id: "softmax", label: "Softmax", level: "statement", status: "neutral", piece: "machine", anchor: { file: "model.py", line: "69", source: "F.softmax(att, dim=-1)" } },
          ],
        },
        { id: "weighted-value", label: "att @ v", level: "dataflow", status: "neutral", piece: "junction", anchor: { file: "model.py", line: "71", source: "y = att @ v" } },
        { id: "output-proj", label: "Output projection", level: "function", status: "neutral", piece: "valve", anchor: { file: "model.py", line: "74-75", source: "self.resid_dropout(self.c_proj(y))" } },
      ],
    },
    { id: "residual-1", label: "Residual merge", level: "dataflow", status: "neutral", piece: "junction", anchor: { file: "model.py", line: "104", source: "x = x + self.attn(self.ln_1(x))" } },
    { id: "ln2", label: "LayerNorm 2", level: "logic", status: "neutral", piece: "valve", anchor: { file: "model.py", symbol: "LayerNorm.forward", line: "26-27" } },
    { id: "mlp", label: "MLP", level: "logic", status: "neutral", piece: "machine", anchor: { file: "model.py", symbol: "MLP.forward", line: "87-92" } },
    { id: "residual-2", label: "Residual merge", level: "dataflow", status: "neutral", piece: "junction", anchor: { file: "model.py", line: "105", source: "x = x + self.mlp(self.ln_2(x))" } },
  ],
};

const transformerBlocks = Array.from({ length: 12 }, (_, index) => index === 6 ? faultBlock : transformerBlock(index));

/**
 * A fault-injected replay over the public nanoGPT model structure.
 * The original nanoGPT source is not modified or claimed to contain this defect.
 */
export const nanoGptCase: PipeNode = {
  id: "gpt-forward",
  label: "GPT.forward",
  subtitle: "nanoGPT model.py",
  level: "behavior",
  status: "fault",
  piece: "machine",
  anchor: { file: "model.py", symbol: "GPT.forward", line: "170-193" },
  children: [
    {
      id: "token-position-embedding",
      label: "Embedding",
      subtitle: "token + position",
      level: "logic",
      status: "healthy",
      piece: "junction",
      anchor: { file: "model.py", symbol: "GPT.forward", line: "176-179", source: "tok_emb + pos_emb" },
      edges: [
        { id: "embedding-input-token", from: "$input", to: "wte", kind: "branch" },
        { id: "embedding-input-position", from: "$input", to: "wpe", kind: "branch" },
        { id: "embedding-token-merge", from: "wte", to: "embed-add", kind: "branch" },
        { id: "embedding-position-merge", from: "wpe", to: "embed-add", kind: "branch" },
        { id: "embedding-output", from: "embed-add", to: "$output", kind: "sequence" },
      ],
      children: [
        { id: "wte", label: "wte(idx)", level: "function", status: "healthy", piece: "valve", anchor: { file: "model.py", symbol: "transformer.wte", line: "177" } },
        { id: "wpe", label: "wpe(pos)", level: "function", status: "healthy", piece: "valve", anchor: { file: "model.py", symbol: "transformer.wpe", line: "178" } },
        { id: "embed-add", label: "tok_emb + pos_emb", level: "dataflow", status: "healthy", piece: "junction", anchor: { file: "model.py", line: "179", source: "x = self.transformer.drop(tok_emb + pos_emb)" } },
      ],
    },
    {
      id: "transformer-stack",
      label: "Transformer Blocks ×12",
      subtitle: "Block.forward",
      level: "logic",
      status: "fault",
      piece: "machine",
      anchor: { file: "model.py", symbol: "Block", line: "180-181" },
      children: transformerBlocks,
    },
    { id: "final-ln", label: "Final LayerNorm", level: "logic", status: "neutral", piece: "valve", anchor: { file: "model.py", line: "182", source: "x = self.transformer.ln_f(x)" } },
    { id: "lm-head", label: "LM Head", level: "logic", status: "neutral", piece: "machine", anchor: { file: "model.py", line: "184-190", source: "logits = self.lm_head(...)" } },
    { id: "logits", label: "Logits", level: "behavior", status: "neutral", piece: "straight", anchor: { file: "model.py", symbol: "GPT.forward", line: "184-193" } },
  ],
};

export const nanoGptAgentReplay: ScriptedAgentStep[] = [
  { id: "a1", action: "search", target: "logits instability", state: "visited", note: "Start from the failing behavior." },
  { id: "a2", action: "open", target: "GPT.forward", nodeId: "gpt-forward", state: "aligned", note: "Open the main execution path." },
  { id: "a3", action: "inspect", target: "MLP", nodeId: "mlp", state: "gap", note: "Agent first explores a plausible but runtime-weak region." },
  { id: "a4", action: "backtrack", target: "Block 6", nodeId: "block-6", state: "visited", note: "Backtrack after the MLP path does not explain the symptom." },
  { id: "a5", action: "inspect", target: "CausalSelfAttention", nodeId: "attention", state: "aligned", note: "Runtime evidence points into attention." },
  { id: "a6", action: "inspect", target: "Attention scores", nodeId: "attention-score", state: "aligned", note: "Narrow from function to dataflow." },
  { id: "a7", action: "inspect", target: "Scale by √dₖ", nodeId: "scale", state: "aligned", note: "Reach the injected faulty statement." },
  { id: "a8", action: "patch", target: "Scale by √dₖ", nodeId: "scale", state: "pending", note: "Candidate edit is constrained to the selected statement." },
];

export function findPipeNode(root: PipeNode, id: string): PipeNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findPipeNode(child, id);
    if (found) return found;
  }
  return undefined;
}

export function findPipePath(root: PipeNode, id: string, path: PipeNode[] = []): PipeNode[] | undefined {
  const next = [...path, root];
  if (root.id === id) return next;
  for (const child of root.children ?? []) {
    const found = findPipePath(child, id, next);
    if (found) return found;
  }
  return undefined;
}
