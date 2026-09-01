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
};

export type ScriptedAgentStep = {
  id: string;
  action: "search" | "open" | "inspect" | "test" | "backtrack" | "patch";
  target: string;
  nodeId?: string;
  state: "visited" | "gap" | "aligned" | "pending";
  note: string;
};

const healthyBlock = (index: number): PipeNode => ({
  id: `block-${index}`,
  label: `Block ${index}`,
  level: "function",
  status: "healthy",
  piece: "machine",
  anchor: { file: "model.py", symbol: "Block.forward" },
});

const faultBlock: PipeNode = {
  id: "block-6",
  label: "Block 6",
  subtitle: "fault-localized replay",
  level: "function",
  status: "fault",
  piece: "machine",
  anchor: { file: "model.py", symbol: "Block.forward", source: "x = x + self.attn(self.ln_1(x))" },
  children: [
    { id: "ln1", label: "LayerNorm 1", level: "logic", status: "healthy", piece: "valve", anchor: { file: "model.py", symbol: "LayerNorm.forward" } },
    {
      id: "attention",
      label: "CausalSelfAttention",
      level: "logic",
      status: "fault",
      piece: "machine",
      anchor: { file: "model.py", symbol: "CausalSelfAttention.forward" },
      children: [
        { id: "qkv", label: "Q / K / V projection", level: "function", status: "healthy", piece: "splitter", anchor: { file: "model.py", source: "q, k, v = self.c_attn(x).split(...)" } },
        { id: "reshape-heads", label: "Split heads", level: "dataflow", status: "healthy", piece: "straight", anchor: { file: "model.py", source: "view(...).transpose(1, 2)" } },
        {
          id: "attention-score",
          label: "Attention scores",
          level: "dataflow",
          status: "fault",
          piece: "junction",
          anchor: { file: "model.py", source: "att = (q @ k.transpose(-2, -1)) * scale" },
          children: [
            { id: "qk-matmul", label: "q @ kᵀ", level: "statement", status: "healthy", piece: "junction", anchor: { file: "model.py", source: "q @ k.transpose(-2, -1)" } },
            {
              id: "scale",
              label: "Scale by √dₖ",
              subtitle: "fault injected for demo",
              level: "statement",
              status: "fault",
              piece: "blocked",
              anchor: { file: "model.py", source: "* (1.0 / math.sqrt(k.size(-1)))" },
            },
            { id: "causal-mask", label: "Causal mask", level: "statement", status: "healthy", piece: "valve", anchor: { file: "model.py", source: "att.masked_fill(..., -inf)" } },
            { id: "softmax", label: "Softmax", level: "statement", status: "healthy", piece: "machine", anchor: { file: "model.py", source: "F.softmax(att, dim=-1)" } },
          ],
        },
        { id: "weighted-value", label: "att @ v", level: "dataflow", status: "healthy", piece: "junction", anchor: { file: "model.py", source: "y = att @ v" } },
        { id: "output-proj", label: "Output projection", level: "function", status: "healthy", piece: "valve", anchor: { file: "model.py", source: "self.resid_dropout(self.c_proj(y))" } },
      ],
    },
    { id: "residual-1", label: "Residual add", level: "dataflow", status: "fault", piece: "bypass", anchor: { file: "model.py", source: "x = x + self.attn(self.ln_1(x))" } },
    { id: "ln2", label: "LayerNorm 2", level: "logic", status: "healthy", piece: "valve", anchor: { file: "model.py", symbol: "LayerNorm.forward" } },
    { id: "mlp", label: "MLP", level: "logic", status: "healthy", piece: "machine", anchor: { file: "model.py", symbol: "MLP.forward" } },
    { id: "residual-2", label: "Residual add", level: "dataflow", status: "healthy", piece: "bypass", anchor: { file: "model.py", source: "x = x + self.mlp(self.ln_2(x))" } },
  ],
};

const transformerBlocks = Array.from({ length: 12 }, (_, index) => index === 6 ? faultBlock : healthyBlock(index));

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
  anchor: { file: "model.py", symbol: "GPT.forward" },
  children: [
    {
      id: "token-position-embedding",
      label: "Embedding",
      subtitle: "token + position",
      level: "logic",
      status: "healthy",
      piece: "junction",
      anchor: { file: "model.py", symbol: "GPT.forward", source: "tok_emb + pos_emb" },
      children: [
        { id: "wte", label: "wte(idx)", level: "function", status: "healthy", piece: "valve", anchor: { file: "model.py", symbol: "transformer.wte" } },
        { id: "wpe", label: "wpe(pos)", level: "function", status: "healthy", piece: "valve", anchor: { file: "model.py", symbol: "transformer.wpe" } },
        { id: "embed-add", label: "tok_emb + pos_emb", level: "dataflow", status: "healthy", piece: "junction", anchor: { file: "model.py", source: "x = self.transformer.drop(tok_emb + pos_emb)" } },
      ],
    },
    {
      id: "transformer-stack",
      label: "Transformer Blocks ×12",
      subtitle: "Block.forward",
      level: "logic",
      status: "fault",
      piece: "machine",
      anchor: { file: "model.py", symbol: "Block" },
      children: transformerBlocks,
    },
    { id: "final-ln", label: "Final LayerNorm", level: "logic", status: "fault", piece: "valve", anchor: { file: "model.py", source: "x = self.transformer.ln_f(x)" } },
    { id: "lm-head", label: "LM Head", level: "logic", status: "fault", piece: "machine", anchor: { file: "model.py", source: "logits = self.lm_head(...)" } },
    { id: "logits", label: "Logits", level: "behavior", status: "fault", piece: "straight", anchor: { file: "model.py", symbol: "GPT.forward" } },
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
