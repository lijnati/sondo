import { expect, test } from "@playwright/test";

test("landing renders the hero and the CTA opens the brief page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Stop guessing what your audience loves." })).toBeVisible();

  await page.getByRole("link", { name: "Build a cultural brief" }).first().click();
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByRole("heading", { level: 1, name: "Build a cultural brief" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("unknown and malformed report ids return a real 404 with the designed state", async ({ page }) => {
  for (const path of ["/r/does-not-exist", "/r/zzzzzzzzzzzz"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
  }
  await expect(page.getByRole("heading", { name: "Report not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Build a cultural brief" })).toBeVisible();
});

test("no horizontal overflow on product and marketing pages", async ({ page }) => {
  for (const path of ["/", "/new", "/r/does-not-exist"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
