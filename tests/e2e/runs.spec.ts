import { expect, test } from "@playwright/test";

test("submitting an empty brief shows plain-English field errors and starts nothing", async ({ page }) => {
  let posted = false;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/runs") && r.method() === "POST") posted = true;
  });
  await page.goto("/new");
  await page.getByRole("button", { name: /Run research/ }).click();
  await expect(page.getByText("Brand name is required.")).toBeVisible();
  await expect(page.getByText("Market is required.")).toBeVisible();
  await expect(page.getByText("Some fields need attention before Sondo can start.")).toBeVisible();
  await expect(page.getByLabel(/Brand name/)).toBeFocused();
  expect(posted).toBe(false);
});

test("an example prefills the form and the rail shows what Qloo will model", async ({ page }) => {
  await page.goto("/new");
  await page.getByRole("button", { name: "Hotel · Lisbon" }).click();
  await expect(page.getByLabel(/Brand name/)).toHaveValue("Casa Azulejo");
  await expect(page.getByRole("complementary", { name: "How Sondo will read this brief" })).toContainText("Lisbon");
  await expect(page.getByText("Some fields need attention")).toHaveCount(0);
});

test("the runs API rejects invalid briefs and unknown ids", async ({ request }) => {
  const bad = await request.post("/api/runs", { data: { brief: { brandName: "" } } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toBe("invalid_brief");
  expect((await request.get("/api/runs/zzzzzzzzzzzz")).status()).toBe(404);
  expect((await request.post("/api/runs/zzzzzzzzzzzz/cancel")).status()).toBe(404);
});

test("featured reports open from the landing page and render validated content", async ({ page }) => {
  // Locally the report (about 0.5 MB of JSON) crosses the WAN from Neon; allow for it.
  test.setTimeout(120_000);
  await page.goto("/");
  const cards = page.locator("#featured a.featured-card");
  if ((await cards.count()) === 0) test.skip(true, "No featured reports in this database");
  const href = await cards.first().getAttribute("href");
  const res = await page.goto(href!, { timeout: 90_000 });
  expect(res?.status()).toBe(200);
  await expect(page.locator(".status-completed").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Three concepts/ })).toBeVisible();
  await expect(page.locator("article.concept")).toHaveCount(3);
  await page.locator("button.ev").first().click();
  await expect(page.getByRole("dialog")).toContainText("in this Qloo query");
  await page.keyboard.press("Escape");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

// Spends real Qloo and model quota. Opt in with E2E_LIVE=1.
test("live: a brief runs end to end and opens its permalink", async ({ page }, info) => {
  test.skip(!process.env.E2E_LIVE || info.project.name !== "desktop", "Set E2E_LIVE=1 to run (desktop only)");
  test.setTimeout(240_000);
  await page.goto("/new");
  await page.getByRole("button", { name: "Cold brew · Austin" }).click();
  await page.getByRole("button", { name: /Run research/ }).click();
  await expect(page).toHaveURL(/\/r\/[0-9A-Za-z]{12}$/, { timeout: 20_000 });
  await expect(page.getByText(/Researching Oat Hour/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Oat Hour" })).toBeVisible({ timeout: 220_000 });
  await expect(page.locator(".report-meta .status")).toHaveText(/Complete|Partial/);
});
