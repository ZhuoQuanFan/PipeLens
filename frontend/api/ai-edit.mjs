const requestBuckets = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 6;
const MAX_SOURCE_LENGTH = 120_000;

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

  const { filePath, source, instruction, selection } = request.body ?? {};
  if (typeof filePath !== "string" || typeof source !== "string" || typeof instruction !== "string") {
    return json(response, 400, { error: "filePath, source and instruction are required." });
  }
  if (!instruction.trim() || instruction.length > 4_000 || source.length > MAX_SOURCE_LENGTH) {
    return json(response, 413, { error: "The instruction or source file is too large." });
  }

  const selectedRange = selection?.line ? `Selected visual scope: ${selection.label ?? "component"}, ${filePath}:${selection.line}.` : "";
  const prompt = [
    selectedRange,
    `Requested change: ${instruction.trim()}`,
    "Return the complete updated file, preserving all unrelated code and formatting.",
    `FILE ${filePath}:\n${source}`,
  ].filter(Boolean).join("\n\n");

  try {
    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [
          { role: "system", content: "You are PipeLens, a precise coding agent. Reply as one JSON object with string fields updated_source and summary. Never use markdown fences." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 8_192,
        stream: false,
      }),
    });
    const payload = await upstream.json();
    if (!upstream.ok) return json(response, upstream.status, { error: payload?.error?.message ?? "DeepSeek request failed." });
    const raw = payload?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return json(response, 502, { error: "DeepSeek returned no editable source." });
    const parsed = JSON.parse(raw);
    if (typeof parsed.updated_source !== "string" || typeof parsed.summary !== "string") {
      return json(response, 502, { error: "DeepSeek returned an invalid edit response." });
    }
    return json(response, 200, { updatedSource: parsed.updated_source, summary: parsed.summary, model: "deepseek-v4-flash" });
  } catch (error) {
    return json(response, 502, { error: error instanceof Error ? error.message : "DeepSeek request failed." });
  }
}
