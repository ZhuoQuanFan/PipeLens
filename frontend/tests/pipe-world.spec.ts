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
  await page.goto("/");
  const executionStatus = page.locator(".game-world-hud.top-left strong");
  await expect(executionStatus).toHaveText("FLOW BLOCKED · CausalSelfAttention", { timeout: 10_000 });

  await page.getByRole("button", { name: "Restart" }).click();
  await expect(executionStatus).toHaveText("EXECUTION RUNNING");
  await expect(executionStatus).toHaveText("FLOW BLOCKED · CausalSelfAttention", { timeout: 10_000 });

  const canvas = await expectCanvasReady(page);
  const dimensions = await canvas.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }));
  await canvas.click({ position: { x: dimensions.width / 2, y: dimensions.height / 2 } });
  await expect(page.getByRole("button", { name: "logic CausalSelfAttention" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Q / K / V projection" })).toBeVisible();
  await expectCanvasReady(page);

  await page.getByRole("button", { name: "function Block 6" }).click();
  await expect(page.getByRole("button", { name: "logic CausalSelfAttention" })).toHaveCount(0);
  await expectCanvasReady(page);
  expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);
});

test("agent replay and responsive resize keep a single live canvas", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto("/");
  await expectCanvasReady(page);

  await page.getByRole("button", { name: "inspect CausalSelfAttention" }).click();
  await expect(page.getByRole("heading", { name: "CausalSelfAttention" })).toBeVisible();

  await page.setViewportSize({ width: 800, height: 700 });
  await expectCanvasReady(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expectCanvasReady(page);
  expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);
});
