import { expect, test, type Page } from "@playwright/test";

function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function expectCanvasReady(page: Page) {
  const canvas = page.locator("canvas.pipe-world-canvas");
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible();
  const dimensions = await canvas.evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
  }));
  expect(dimensions.width).toBeGreaterThan(0);
  expect(dimensions.height).toBeGreaterThan(0);
  return canvas;
}

test("loads one PixiJS canvas and hard-stops at the injected fault", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "PipeLens PipeWorld" })).toBeVisible();
  await expectCanvasReady(page);

  const executionStatus = page.locator(".game-world-hud.top-left strong");
  await expect(executionStatus).toHaveText("FLOW BLOCKED · CausalSelfAttention", { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Replay" })).toBeVisible();
  expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);
});

test("restart replays and component traversal returns through the breadcrumb", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.route("**/api/run-python", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      runId: "py-failed", status: "failed", summary: "Python execution reproduced the attention scaling fault.",
      file: "model.py", nodeId: "scale", line: 67, durationMs: 1.2, expected: 4, actual: 16,
      trace: [{ file: "model.py", line: 67, event: "assertion", status: "fault" }],
    }) });
  });
  await page.goto("/");
  const executionStatus = page.locator(".game-world-hud.top-left strong");
  await expect(executionStatus).toHaveText("FLOW BLOCKED · CausalSelfAttention", { timeout: 10_000 });

  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.getByRole("button", { name: "Running Python…" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("PYTHON FAILED");
  await expect(executionStatus).toHaveText("FLOW BLOCKED · CausalSelfAttention", { timeout: 10_000 });

  const canvas = await expectCanvasReady(page);
  const dimensions = await canvas.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }));
  await canvas.click({ position: { x: dimensions.width / 2, y: dimensions.height / 2 } });
  await expect(page.getByRole("button", { name: "logic CausalSelfAttention" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Q / K / V projection" })).toBeVisible();
  await expect(page.getByLabel("Source code").locator(".source-location code")).toHaveText("L56");
  await expect(page.getByLabel("Source code").locator('[data-line="56"]')).toHaveClass(/active/);
  await expectCanvasReady(page);

  await page.getByRole("button", { name: "function Block 6" }).click();
  await expect(page.getByRole("button", { name: "logic CausalSelfAttention" })).toHaveCount(0);
  await expect(page.getByLabel("Source code").locator(".source-location code")).toHaveText("L103–106");
  await expect(page.getByLabel("Source code").locator('[data-line="104"]')).toHaveClass(/active/);
  await expectCanvasReady(page);
  expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);
});

test("agent replay and responsive resize keep a single live canvas", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto("/");
  await expectCanvasReady(page);

  await page.getByRole("button", { name: "inspect CausalSelfAttention" }).click();
  await expect(page.getByRole("heading", { name: "CausalSelfAttention" })).toBeVisible();
  await expect(page.getByLabel("Source code").locator(".source-location code")).toHaveText("L52–76");

  await page.setViewportSize({ width: 800, height: 700 });
  await expectCanvasReady(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expectCanvasReady(page);
  expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);
});

test("fixes a real case, verifies it, then restores the faulty baseline", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.route("**/api/ai-edit", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        replacementSource: "            att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))",
        summary: "Restore inverse square-root head scaling.",
      }),
    });
  });
  await page.route("**/api/run-python", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      runId: "py-passed", status: "passed", summary: "Python execution passed; the attention scale is correct.",
      file: "model.py", nodeId: "scale", line: 67, durationMs: 0.8, expected: 4, actual: 4,
      trace: [{ file: "model.py", line: 67, event: "line", status: "healthy" }],
    }) });
  });

  await page.goto("/");
  await expectCanvasReady(page);
  await expect(page.getByText("PERSONAL WORKSPACE")).toBeVisible();
  await expect(page.getByRole("region", { name: "Debug cases" }).getByRole("button")).toHaveCount(4);
  await expect(page.getByRole("link", { name: /GitHub/i })).toHaveCount(0);

  const inspector = page.locator(".pipe-inspector");
  const before = await inspector.evaluate((element) => element.getBoundingClientRect().width);
  await page.getByRole("separator", { name: "Resize source inspector" }).press("ArrowLeft");
  const after = await inspector.evaluate((element) => element.getBoundingClientRect().width);
  expect(after).toBeGreaterThan(before);

  await page.getByRole("button", { name: "inspect Scale by √dₖ" }).click();
  await expect(page.getByText("Expected 4 · observed 16").first()).toBeVisible();
  await page.getByLabel("AI edit instruction").fill("Fix the observed attention scaling failure");
  await page.getByRole("button", { name: "Ask AI to modify" }).click();
  await expect(page.getByRole("status")).toContainText("inspecting");
  await expect(page.getByText("Restore inverse square-root head scaling.")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("editing");
  await page.getByRole("button", { name: "Apply · Restart to verify" }).click();
  await expect(page.locator(".ai-worker-status")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Source code" })).toContainText("1.0 / math.sqrt(k.size(-1))");
  await expect(page.getByText("CODE CHANGED · RESTART TO VERIFY")).toBeVisible();
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.getByText(/PYTHON PASS · L67/)).toBeVisible();
  await page.getByRole("button", { name: "Reset case" }).click();
  await expect(page.getByRole("region", { name: "Source code" })).toContainText("* math.sqrt(k.size(-1))");
  await expect(page.getByText("Expected 4 · observed 16").first()).toBeVisible();
  expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);
});
