import { afterEach, describe, expect, it, vi } from "vitest";

import handler from "./ai-edit.mjs";

function request(address) {
  return {
    method: "POST",
    headers: { origin: "https://pipelens-latest.vercel.app", "x-forwarded-for": address },
    body: {
      filePath: "model.py",
      instruction: "修复一下",
      selection: { label: "Scale", line: "67" },
      selectedSource: "att = q @ k",
      sourceContext: "67: att = q @ k",
    },
  };
}

function response() {
  return {
    statusCode: 200,
    body: "",
    status(code) { this.statusCode = code; return this; },
    setHeader() { return this; },
    end(body) { this.body = body; },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DEEPSEEK_API_KEY;
});

describe("AI edit endpoint", () => {
  it("retries an incomplete JSON response with thinking disabled", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: "{\"replacement_source\":" } }] }) })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: "{\"replacement_source\":\"att = q @ k\",\"summary\":\"Kept the scoped statement.\"}" } }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = response();

    await handler(request("test-retry"), result);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).replacementSource).toBe("att = q @ k");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).thinking).toEqual({ type: "disabled" });
  });

  it("returns a useful message instead of a JSON parser exception", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: "" } }] }) }));
    const result = response();

    await handler(request("test-incomplete"), result);

    expect(result.statusCode).toBe(502);
    expect(JSON.parse(result.body).error).toContain("incomplete edit twice");
    expect(result.body).not.toContain("Unexpected end of JSON input");
  });

  it("retries when the upstream HTTP body itself is truncated", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => "{\"choices\":" })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: "{\"replacement_source\":\"att = q @ k\",\"summary\":\"Recovered after retry.\"}" } }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = response();

    await handler(request("test-http-truncated"), result);

    expect(result.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.body).not.toContain("Unexpected end of JSON input");
  });
});
