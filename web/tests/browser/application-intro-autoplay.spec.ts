import { expect, test } from "@playwright/test";
import { observeStartup, readStartup } from "./helpers/application-startup";

// Worker launch options must be declared at file level, separately from the
// strict first-visit activation checks in application-intro.spec.ts.
test.use({
  trace: "off",
  launchOptions: { args: ["--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] },
});

test("menu-open plays once during preparation and does not replay after refresh", async ({ page }) => {
  await observeStartup(page, true);
  const cdp = await page.context().newCDPSession(page);
  await page.goto("/?lang=en&check=startup-cue");
  await expect.poll(() => readStartup(cdp), { timeout: 15000 }).toMatchObject({ phase: "loading", activated: false, entryCount: 0, menuOpen: [{ phase: "loading" }] });
  await cdp.send("Runtime.evaluate", { expression: "window.startupProbe.releaseFrames()", userGesture: false });
  await expect.poll(() => readStartup(cdp), { timeout: 15000 }).toMatchObject({ phase: "ready", entryCount: 0, menuOpen: [{ phase: "loading" }] });
  await page.reload();
  await expect.poll(() => readStartup(cdp)).toMatchObject({ phase: "ready", entryCount: 0, menuOpen: [] });
  await cdp.detach();
});

for (const silence of ["master mute", "effects disabled", "zero effects volume"] as const) {
  test(`startup cue respects ${silence}`, async ({ page }) => {
    await observeStartup(page);
    await page.addInitScript((silence) => localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({
      schemaVersion: 1, muted: silence === "master mute", musicEnabled: false,
      effectsEnabled: silence !== "effects disabled", musicVolume: 0.35, effectsVolume: silence === "zero effects volume" ? 0 : 0.5,
    })), silence);
    const cdp = await page.context().newCDPSession(page);
    await page.goto("/?lang=en&check=startup-silence");
    await expect.poll(() => readStartup(cdp), { timeout: 15000 }).toMatchObject({ phase: "ready", entryCount: 0, menuOpen: [] });
    await cdp.detach();
  });
}
