import { expect, test } from "@playwright/test";
import { observeStartup, readStartup } from "./helpers/application-startup";

// Trace snapshots and page.evaluate grant user activation in Chromium. Keep
// startup observations on CDP without a gesture, just like the audio suite.
test.use({
  trace: "off",
  launchOptions: { args: ["--enable-unsafe-swiftshader", "--autoplay-policy=document-user-activation-required"] },
});

for (const locale of ["en", "pt-BR"] as const) {
  test(`startup prepares the scene and enters directly without a welcome modal (${locale})`, async ({ page }) => {
    await observeStartup(page, true);
    const cdp = await page.context().newCDPSession(page);
    await page.goto(`/?lang=${locale}&check=startup#entry`);
    await expect.poll(() => readStartup(cdp)).toMatchObject({ phase: "loading", sceneBusy: true, canvasCount: 1, entryCount: 0, activated: false });
    await expect.poll(() => readStartup(cdp), { timeout: 10000 }).toMatchObject({ phase: "loading", sceneBusy: true, indeterminate: true, progress: null, entryCount: 0, activated: false });
    await cdp.send("Runtime.evaluate", { expression: "window.startupProbe.releaseFrames()", userGesture: false });
    await expect.poll(() => readStartup(cdp), { timeout: 15000 }).toMatchObject({ phase: "ready", sceneBusy: false, entryCount: 0, activated: false, menuOpen: [] });
    const complete = await readStartup(cdp);
    expect(complete.phases).toContain("loading");
    expect(complete.phases).not.toContain("entry");
    expect(complete.phases.slice(complete.phases.indexOf("ready") + 1)).not.toContain("loading");
    await expect(page).toHaveURL((url) => url.searchParams.get("lang") === locale && url.searchParams.get("check") === "startup" && url.hash === "#entry");

    await page.reload();
    await expect.poll(() => readStartup(cdp)).toMatchObject({ phase: "ready", entryCount: 0, menuOpen: [] });
    expect((await readStartup(cdp)).phases).not.toContain("loading");
    await cdp.detach();
  });
}

test("unavailable WebGL settles startup and leaves the atlas accessible", async ({ page }) => {
  await observeStartup(page);
  await page.addInitScript(() => {
    localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({ schemaVersion: 1, musicEnabled: false, effectsEnabled: false, musicVolume: 0.35, effectsVolume: 0.5 }));
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type, ...args) {
      if (String(type).startsWith("webgl") || type === "experimental-webgl") return null;
      return getContext.call(this, type, ...args);
    } as typeof getContext;
  });
  await page.goto("/?lang=en");
  await expect(page.locator("[data-application-intro]")).toHaveAttribute("data-application-intro", "ready", { timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Your atlas is ready", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Find a planet", exact: true }).click();
  const menu = page.locator('.universe-explorer-menu[role="dialog"]');
  await menu.getByRole("tab", { name: "Go to", exact: true }).click();
  await menu.getByRole("textbox", { name: "Search planets", exact: true }).fill("earth");
  await expect(menu.locator(".universe-menu-planet-text strong").filter({ hasText: /^Earth$/ })).toBeVisible();
});

test("a first visit outside the explorer finishes without waiting for a scene", async ({ page }) => {
  await observeStartup(page);
  await page.addInitScript(() => localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({ schemaVersion: 1, musicEnabled: false, effectsEnabled: false, musicVolume: 0.35, effectsVolume: 0.5 })));
  await page.goto("/example?lang=pt-BR");
  await expect(page.locator("[data-application-intro]")).toHaveAttribute("data-application-intro", "loading");
  await expect(page.locator("[data-application-intro]")).toHaveAttribute("data-application-intro", "ready", { timeout: 10000 });
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("textbox")).toBeVisible();
});
