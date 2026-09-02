import type { AiEditCandidate } from "../workspace/types";

type AiEditRequest = {
  filePath: string;
  source: string;
  instruction: string;
  selection: { label: string; line?: string };
};

export async function requestDeepSeekEdit(request: AiEditRequest): Promise<AiEditCandidate> {
  const response = await fetch("/api/ai-edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await response.json() as { updatedSource?: string; summary?: string; error?: string };
  if (!response.ok || !payload.updatedSource || !payload.summary) {
    throw new Error(payload.error ?? "DeepSeek could not create an edit.");
  }
  return { updatedSource: payload.updatedSource, summary: payload.summary };
}
