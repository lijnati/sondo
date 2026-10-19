import { expect, test } from "@playwright/test";

test("a pixel scene canvas renders with non-zero size", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("[data-preset='meadow'] .scene-art canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  expect(box?.height ?? 0).toBeGreaterThan(100);

  const scenes = page.locator("[data-preset]");
  await expect(scenes).toHaveCount(3);
  const seeds = await scenes.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-seed")));
  expect(new Set(seeds).size).toBe(seeds.length);
  expect(seeds).toContain("4");
  await expect(page.locator("[data-preset='bloom']")).toHaveCount(1);
  await expect(page.locator("[data-preset='dusk']")).toHaveCount(1);
});

test("tabs switch panels by click and by ArrowRight", async ({ page }) => {
  await page.goto("/");
  const strategists = page.getByRole("tab", { name: "For strategists" });
  const judges = page.getByRole("tab", { name: "For judges" });

  await judges.click();
  await expect(judges).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "For judges" })).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: "For strategists" })).toBeHidden();

  await page.keyboard.press("ArrowRight");
  await expect(strategists).toHaveAttribute("aria-selected", "true");
  await expect(strategists).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "For strategists" })).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(judges).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "For judges" })).toBeVisible();
});

test("an FAQ answer opens from the summary", async ({ page }) => {
  await page.goto("/");
  const item = page.locator("details").filter({ hasText: "Does Sondo predict ROI?" });
  await expect(item).not.toHaveAttribute("open", "");
  await item.locator("summary").click();
  await expect(item).toHaveJSProperty("open", true);
  await expect(item.getByText(/does not predict purchase intent/i)).toBeVisible();
});

test("no horizontal overflow at 390 and 1440", async ({ page }) => {
  for (const size of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${size.width}px`).toBeLessThanOrEqual(1);
  }
});

test("reduced motion shows reveals without scrolling", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const opacities = await page.locator(".reveal").evaluateAll((nodes) =>
    nodes.map((node) => Number.parseFloat(getComputedStyle(node).opacity)),
  );
  expect(opacities.length).toBeGreaterThan(3);
  expect(opacities.every((opacity) => opacity === 1)).toBe(true);
});

test("marketing stays paper-light while product dark mode is unchanged", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const marketingBg = await page.locator(".marketing").evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(marketingBg).toBe("rgb(255, 255, 255)");

  await page.goto("/new");
  const productBg = await page.locator("body").evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(productBg).toBe("rgb(11, 11, 12)");
});
