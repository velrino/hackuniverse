import { expect, test, type Page } from "@playwright/test";

async function openViewSettings(page: Page) {
  await page.getByRole("button", { name: "Explorer menu", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Mission controls", exact: true });
  await menu.getByRole("tab", { name: "Settings", exact: true }).click();
  await menu.getByRole("button", { name: "Visual", exact: true }).click();
  return page.getByRole("dialog", { name: "Visual", exact: true });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("hackuniverse.intro.v1.seen", "1");
    localStorage.setItem("hackuniverse.demo-tour.v1.seen", "1");
    localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({ schemaVersion: 1, muted: true, musicEnabled: false, effectsEnabled: false, musicVolume: 0.35, effectsVolume: 0.5 }));
  });
});

test("illustrative defaults, settings persist, and a query overrides the saved choice without remounting", async ({ page }) => {
  await page.goto("/?lang=en&keep=example#settings");
  await expect(page.locator("main")).toHaveAttribute("data-body-scale", "illustrative");
  await expect(page.locator('.universe-scene[aria-busy]')).toHaveAttribute("aria-busy", "false");
  const canvas = await page.locator("canvas").elementHandle();
  const visual = await openViewSettings(page);
  await expect(visual.getByRole("button", { name: "Illustrative", exact: true })).toHaveAttribute("aria-pressed", "true");
  await visual.getByRole("button", { name: "Proportional", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-body-scale", "proportional");
  await expect(visual.getByRole("button", { name: "Proportional", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator("canvas").evaluate((node, original) => node === original, canvas)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("hackuniverse.body-scale.v1"))).toBe("proportional");
  const url = new URL(page.url());
  expect(url.searchParams.get("scale")).toBe("proportional");
  expect(url.searchParams.get("keep")).toBe("example");
  expect(url.searchParams.get("lang")).toBe("en");
  expect(url.hash).toBe("#settings");
  await page.goto("/?lang=en");
  await expect(page.locator("main")).toHaveAttribute("data-body-scale", "proportional");
  await page.goto("/?lang=en&scale=illustrative");
  await expect(page.locator("main")).toHaveAttribute("data-body-scale", "illustrative");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("hackuniverse.body-scale.v1"))).toBe("illustrative");
  await page.reload();
  await expect(page.locator("main")).toHaveAttribute("data-body-scale", "illustrative");
});

test("invalid or repeated scale parameters fall back to the saved preference", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("hackuniverse.body-scale.v1", "proportional"));
  for (const query of ["scale=invalid", "scale=illustrative&scale=proportional"]) {
    await page.goto(`/?lang=en&${query}`);
    await expect(page.locator("main")).toHaveAttribute("data-body-scale", "proportional");
  }
});
