import type { AiEditCandidate } from "../workspace/types";

type AiEditRequest = {
  filePath: string;
  source: string;
  instruction: string;
  selection: { label: string; line?: string };
  diagnostic?: string;
};

export async function requestDeepSeekEdit(request: AiEditRequest): Promise<AiEditCandidate> {
  const { start, end } = parseLineRange(request.selection.line);
  const allLines = request.source.split("\n");
  const contextStart = Math.max(1, start - 16);
  const contextEnd = Math.min(allLines.length, end + 16);
  const selectedSource = allLines.slice(start - 1, end).join("\n");
  const sourceContext = allLines
    .slice(contextStart - 1, contextEnd)
    .map((line, index) => `${contextStart + index}: ${line}`)
    .join("\n");
  const response = await fetch("/api/ai-edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filePath: request.filePath,
      instruction: request.instruction,
      selection: { ...request.selection, start, end },
      selectedSource,
      sourceContext,
      diagnostic: request.diagnostic,
    }),
  });
  const responseText = await response.text();
  let payload: { replacementSource?: string; summary?: string; error?: string } = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(response.ok ? "AI returned an unreadable response." : `AI request failed (${response.status}).`);
  }
  if (!response.ok || payload.replacementSource == null || !payload.summary) {
    throw new Error(payload.error ?? "DeepSeek could not create an edit.");
  }
  const updatedLines = [...allLines];
  updatedLines.splice(start - 1, end - start + 1, ...payload.replacementSource.split("\n"));
  const updatedSource = updatedLines.join("\n");
  if (updatedSource === request.source) throw new Error("AI did not change the faulty statement. Add a more specific instruction and try again.");
  return { updatedSource, summary: payload.summary };
}

function parseLineRange(line = "1") {
  const [startText, endText] = line.split("-");
  const start = Math.max(1, Number(startText) || 1);
  const end = Math.max(start, Number(endText ?? startText) || start);
  return { start, end };
}
