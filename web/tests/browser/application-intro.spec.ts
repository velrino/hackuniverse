import { expect, test, type CDPSession, type Page } from "@playwright/test";

type StartupState = {
  phase: string | null;
  phases: string[];
  sceneBusy: boolean;
  canvasCount: number;
  indeterminate: boolean;
  progress: string | null;
  entryCount: number;
  entryPoint: { x: number; y: number } | null;
  activated: boolean;
};

// Trace snapshots and page.evaluate grant user activation in Chromium. Keep
// startup observations on CDP without a gesture, just like the audio suite.
test.use({
  trace: "off",
  launchOptions: { args: ["--enable-unsafe-swiftshader", "--autoplay-policy=document-user-activation-required"] },
});

async function observeStartup(page: Page, holdFirstFrame = false) {
  await page.addInitScript((holdFirstFrame) => {
    localStorage.setItem("hackuniverse.demo-tour.v1.seen", "1");
    const probe = { phases: [] as string[], releaseFrames: () => {} };
    Object.assign(window, { startupProbe: probe });
    const observer = new MutationObserver(() => {
      const phase = document.querySelector("[data-application-intro]")?.getAttribute("data-application-intro");
      if (phase && probe.phases.at(-1) !== phase) probe.phases.push(phase);
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-application-intro"] });

    if (!holdFirstFrame || localStorage.getItem("hackuniverse.intro.v1.seen") === "1") return;
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const pending = new Map<number, FrameRequestCallback>();
    let token = 0;
    // The real WebGL scene mounts and prepares its resources, but its first
    // rendered frame cannot signal readiness until the fixture releases it.
    window.requestAnimationFrame = (callback) => { pending.set(--token, callback); return token; };
    window.cancelAnimationFrame = (id) => { if (!pending.delete(id)) cancel(id); };
    probe.releaseFrames = () => {
      window.requestAnimationFrame = request;
      window.cancelAnimationFrame = cancel;
      for (const callback of pending.values()) request(callback);
      pending.clear();
    };
  }, holdFirstFrame);
}

async function readStartup(cdp: CDPSession): Promise<StartupState> {
  const result = await cdp.send("Runtime.evaluate", {
    userGesture: false,
    returnByValue: true,
    expression: `(() => {
      const entry = [...document.querySelectorAll('.application-intro-entry button')][0];
      const rect = entry?.getBoundingClientRect();
      const progress = document.querySelector('.vui-full-screen-loader [role="progressbar"]');
      return {
        phase: document.querySelector('[data-application-intro]')?.getAttribute('data-application-intro') ?? null,
        phases: window.startupProbe.phases,
        sceneBusy: document.querySelector('.universe-scene[aria-busy]')?.getAttribute('aria-busy') === 'true',
        canvasCount: document.querySelectorAll('canvas').length,
        indeterminate: progress?.getAttribute('data-indeterminate') === 'true',
        progress: progress?.getAttribute('aria-valuenow') ?? null,
        entryCount: document.querySelectorAll('.application-intro-entry button').length,
        entryPoint: rect?.width ? {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2} : null,
        activated: navigator.userActivation.hasBeenActive
      };
    })()`,
  });
  if (result.exceptionDetails) throw new Error("Unable to observe startup without granting activation");
  return result.result.value as StartupState;
}

for (const locale of ["en", "pt-BR"] as const) {
  test(`startup prepares the scene before welcoming the visitor (${locale})`, async ({ page, isMobile }) => {
    await observeStartup(page, true);
    const cdp = await page.context().newCDPSession(page);
    await page.goto(`/?lang=${locale}&check=startup#entry`);
    await expect.poll(() => readStartup(cdp)).toMatchObject({ phase: "loading", sceneBusy: true, canvasCount: 1, entryCount: 0, activated: false });
    // Once the three-second animation finishes, real pending work remains
    // indeterminate instead of reporting 100% or displaying Welcome early.
    await expect.poll(() => readStartup(cdp), { timeout: 10000 }).toMatchObject({ phase: "loading", sceneBusy: true, indeterminate: true, progress: null, entryCount: 0, activated: false });
    await cdp.send("Runtime.evaluate", { expression: "window.startupProbe.releaseFrames()", userGesture: false });
    await expect.poll(() => readStartup(cdp), { timeout: 15000 }).toMatchObject({ phase: "entry", sceneBusy: false, entryCount: 1, activated: false });
    const entry = await readStartup(cdp);
    expect(entry.phases).toContain("loading");
    expect(entry.phases.indexOf("loading")).toBeLessThan(entry.phases.indexOf("entry"));
    expect(entry.entryPoint).not.toBeNull();

    if (isMobile) await page.touchscreen.tap(entry.entryPoint!.x, entry.entryPoint!.y);
    else await page.mouse.click(entry.entryPoint!.x, entry.entryPoint!.y);
    await expect.poll(() => readStartup(cdp)).toMatchObject({ phase: "ready", entryCount: 0 });
    const complete = await readStartup(cdp);
    expect(complete.phases.slice(complete.phases.indexOf("entry") + 1)).not.toContain("loading");
    await expect(page).toHaveURL((url) => url.searchParams.get("lang") === locale && url.searchParams.get("check") === "startup" && url.hash === "#entry");

    await page.reload();
    await expect.poll(() => readStartup(cdp)).toMatchObject({ phase: "ready", entryCount: 0 });
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
  await expect(menu.locator(".universe-menu-planets li")).toHaveCount(1);
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
