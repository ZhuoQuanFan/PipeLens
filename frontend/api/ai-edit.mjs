const requestBuckets = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 6;
const MAX_CONTEXT_LENGTH = 40_000;

function allowedOrigin(origin) {
  if (!origin) return true;
  return origin === "https://pipelens-latest.vercel.app"
    || origin === "https://pipelens-latest-jasonfzq-sysus-projects.vercel.app"
    || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin);
}

function withinRateLimit(request) {
  const forwarded = request.headers["x-forwarded-for"];
  const address = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || request.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (requestBuckets.get(address) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) return false;
  recent.push(now);
  requestBuckets.set(address, recent);
  return true;
}

function json(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed" });
  if (!allowedOrigin(request.headers.origin)) return json(response, 403, { error: "Origin not allowed" });
  if (!withinRateLimit(request)) return json(response, 429, { error: "Too many AI edit requests. Try again in one minute." });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return json(response, 503, { error: "DeepSeek is not configured on this deployment." });

  const { filePath, sourceContext, selectedSource, instruction, selection } = request.body ?? {};
  if (typeof filePath !== "string" || typeof sourceContext !== "string" || typeof selectedSource !== "string" || typeof instruction !== "string") {
    return json(response, 400, { error: "filePath, source context, selected source and instruction are required." });
  }
  if (!instruction.trim() || instruction.length > 4_000 || sourceContext.length > MAX_CONTEXT_LENGTH || selectedSource.length > MAX_CONTEXT_LENGTH) {
    return json(response, 413, { error: "The instruction or source file is too large." });
  }

  const selectedRange = selection?.line ? `Selected visual scope: ${selection.label ?? "component"}, ${filePath}:${selection.line}.` : "";
  const prompt = [
    selectedRange,
    `Requested change: ${instruction.trim()}`,
    "Return only the replacement text for the selected lines. Preserve indentation and do not repeat line numbers.",
    `SELECTED SOURCE:\n${selectedSource}`,
    `NEARBY CONTEXT (read-only, with line numbers):\n${sourceContext}`,
  ].filter(Boolean).join("\n\n");

  try {
    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [
          { role: "system", content: "You are PipeLens, a precise coding agent. Reply as one JSON object with string fields replacement_source and summary. Never use markdown fences. Modify only the selected source." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 2_048,
        stream: false,
      }),
    });
    const payload = await upstream.json();
    if (!upstream.ok) return json(response, upstream.status, { error: payload?.error?.message ?? "DeepSeek request failed." });
    const raw = payload?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return json(response, 502, { error: "DeepSeek returned no editable source." });
    const parsed = JSON.parse(raw);
    if (typeof parsed.replacement_source !== "string" || typeof parsed.summary !== "string") {
      return json(response, 502, { error: "DeepSeek returned an invalid edit response." });
    }
    return json(response, 200, { replacementSource: parsed.replacement_source, summary: parsed.summary, model: "deepseek-v4-flash" });
  } catch (error) {
    return json(response, 502, { error: error instanceof Error ? error.message : "DeepSeek request failed." });
  }
}
