import { expect, test, type CDPSession, type Page } from "@playwright/test";

type TourVoice = { duration: number; started: number; ended: number | null };
type TourMusic = { media: HTMLMediaElement; context: AudioContext };
type TourAudioProbe = { voices: TourVoice[]; music: TourMusic[] };
type ProbedWindow = Window & { tourAudioProbe: TourAudioProbe };
type InitialState = { tourPhase: string | null; tourActive: string | null; introPhase: string | null; hasBeenActive: boolean; startCount: number; entryCount: number; startPoint: { x: number; y: number } | null; entryPoint: { x: number; y: number } | null; menuVisible: boolean; zoomCount: number; music: { paused: boolean; contextState: string }[] };

// Exercise the real first-visit permission boundary rather than relying on a
// browser profile that may already permit autoplay. Reduced motion is covered
// separately by the normal suite, which intentionally suppresses auto tours.
test.use({
  reducedMotion: "no-preference",
  // Trace snapshots also evaluate page code with userGesture:true, granting
  // autoplay before this test can observe the real first-visit boundary.
  trace: "off",
  launchOptions: { args: ["--enable-unsafe-swiftshader", "--autoplay-policy=document-user-activation-required"] },
});

async function observeAudio(page: Page, { muted = false, introSeen = false } = {}) {
  await page.addInitScript(({ muted, introSeen }) => {
    if (introSeen) localStorage.setItem("hackuniverse.intro.v1.seen", "1");
    if (muted) localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({ schemaVersion: 1, musicEnabled: false, effectsEnabled: false, musicVolume: 0.35, effectsVolume: 0.5 }));
    const probe: TourAudioProbe = { voices: [], music: [] };
    (window as unknown as ProbedWindow).tourAudioProbe = probe;
    const mediaSource = AudioContext.prototype.createMediaElementSource;
    AudioContext.prototype.createMediaElementSource = function (media) {
      const source = mediaSource.call(this, media);
      probe.music.push({ media, context: this });
      return source;
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
      if (this.buffer) {
        const voice: TourVoice = { duration: this.buffer.duration, started: performance.now(), ended: null };
        probe.voices.push(voice);
        this.addEventListener("ended", () => { voice.ended = performance.now(); }, { once: true });
      }
      return start.call(this, when, offset, duration);
    };
  }, { muted, introSeen });
}

async function readAudio(page: Page) {
  return page.evaluate(() => {
    const probe = (window as unknown as ProbedWindow).tourAudioProbe;
    return {
      // The active zoom aliases are the only effects longer than five seconds.
      zooms: probe.voices.filter((voice) => voice.duration > 5),
      // The imported menu-open alias is the only active effect in this range.
      menuOpen: probe.voices.filter((voice) => voice.duration > 1.4 && voice.duration < 1.7),
      voiceCount: probe.voices.length,
      music: probe.music.map(({ media, context }) => ({ paused: media.paused, currentTime: media.currentTime, contextState: context.state })),
    };
  });
}

async function readBeforeGesture(cdp: CDPSession): Promise<InitialState> {
  // Playwright Locator/evaluate calls use Runtime.callFunctionOn(userGesture:
  // true). Observe the initial policy boundary without granting activation.
  const result = await cdp.send("Runtime.evaluate", {
    userGesture: false,
    returnByValue: true,
    expression: `(() => {
      const main = document.querySelector('main');
      const buttons = [...document.querySelectorAll('button')];
      const probe = window.tourAudioProbe;
      const menu = buttons.find(button => button.getAttribute('aria-label') === 'Explorer menu');
      const start = buttons.find(button => button.textContent.trim() === 'Start tour');
      const entry = buttons.find(button => button.textContent.trim() === 'Enter universe');
      const point = button => {
        if (!button?.getClientRects().length) return null;
        const rect = button.getBoundingClientRect();
        return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
      };
      return {
        tourPhase: main?.getAttribute('data-tour-phase') ?? null,
        tourActive: main?.getAttribute('data-tour-active') ?? null,
        introPhase: document.querySelector('[data-application-intro]')?.getAttribute('data-application-intro') ?? null,
        hasBeenActive: navigator.userActivation?.hasBeenActive ?? false,
        startCount: buttons.filter(button => button.textContent.trim() === 'Start tour').length,
        entryCount: buttons.filter(button => button.textContent.trim() === 'Enter universe').length,
        startPoint: point(start),
        entryPoint: point(entry),
        menuVisible: Boolean(menu?.getClientRects().length),
        zoomCount: probe?.voices.filter(voice => voice.duration > 5).length ?? 0,
        music: probe?.music.map(({media, context}) => ({paused: media.paused, contextState: context.state})) ?? []
      };
    })()`,
  });
  if (result.exceptionDetails) throw new Error("Unable to observe the native autoplay boundary");
  return result.result.value as InitialState;
}

test("a fresh tour starts music through its button and stops zoom feedback when skipped", async ({ page, isMobile }) => {
  // This returning visitor saw the welcome but has not run the universe tour.
  await observeAudio(page, { introSeen: true });
  await page.goto("/?lang=en&source=demo");
  const cdp = await page.context().newCDPSession(page);
  await expect.poll(() => readBeforeGesture(cdp), { timeout: 20000 }).toMatchObject({ tourPhase: "prompt", tourActive: "false", startCount: 1 });
  const initial = await readBeforeGesture(cdp);
  expect(initial.hasBeenActive).toBe(false);
  expect(initial.zoomCount).toBe(0);
  expect(initial.music.every((music) => music.paused || music.contextState !== "running")).toBe(true);
  expect(initial.startPoint).not.toBeNull();
  await cdp.detach();
  const main = page.locator("main");

  if (isMobile) await page.touchscreen.tap(initial.startPoint!.x, initial.startPoint!.y);
  else await page.mouse.click(initial.startPoint!.x, initial.startPoint!.y);
  await expect(main).toHaveAttribute("data-tour-active", "true");
  await expect.poll(async () => (await readAudio(page)).music.some((music) => !music.paused && music.contextState === "running"), { timeout: 15000 }).toBe(true);
  await expect.poll(async () => {
    const [audio, phase] = await Promise.all([readAudio(page), main.getAttribute("data-tour-phase")]);
    return phase === "arriving" && audio.zooms.some((voice) => voice.ended === null);
  }, { timeout: 15000 }).toBe(true);

  const musicBeforeSkip = (await readAudio(page)).music.find((music) => !music.paused && music.contextState === "running")!.currentTime;
  const skippedAt = await page.evaluate(() => performance.now());
  await page.getByRole("button", { name: "Skip tour", exact: true }).click();
  await expect(main).toHaveAttribute("data-tour-active", "false");
  await expect(main).toHaveAttribute("data-tour-phase", "idle");
  await expect.poll(async () => (await readAudio(page)).zooms.every((voice) => voice.ended !== null)).toBe(true);
  const stopped = await readAudio(page);
  expect(Math.max(...stopped.zooms.map((voice) => voice.ended!)) - skippedAt).toBeLessThan(250);
  await page.waitForTimeout(400);
  expect((await readAudio(page)).zooms).toHaveLength(stopped.zooms.length);
  await expect.poll(async () => (await readAudio(page)).music.some((music) => !music.paused && music.contextState === "running" && music.currentTime > musicBeforeSkip + 0.1)).toBe(true);
});

test("first global entry plays the welcome cue once and unlocks the following tour", async ({ page, isMobile }) => {
  await observeAudio(page);
  await page.goto("/?lang=en&source=demo");
  const cdp = await page.context().newCDPSession(page);
  await expect.poll(() => readBeforeGesture(cdp)).toMatchObject({ introPhase: "entry", entryCount: 1, startCount: 0 });
  const initial = await readBeforeGesture(cdp);
  expect(initial.hasBeenActive).toBe(false);
  expect(initial.entryPoint).not.toBeNull();
  await cdp.detach();
  const intro = page.locator("[data-application-intro]");
  const main = page.locator("main");
  if (isMobile) await page.touchscreen.tap(initial.entryPoint!.x, initial.entryPoint!.y);
  else await page.mouse.click(initial.entryPoint!.x, initial.entryPoint!.y);
  await expect(intro).toHaveAttribute("data-application-intro", "loading");
  await expect.poll(async () => (await readAudio(page)).menuOpen.length).toBe(1);
  await expect.poll(async () => (await readAudio(page)).music.some((music) => !music.paused && music.contextState === "running"), { timeout: 15000 }).toBe(true);
  await expect(intro).toHaveAttribute("data-application-intro", "ready", { timeout: 10000 });
  await expect(main).toHaveAttribute("data-tour-active", "true", { timeout: 15000 });
  await expect(page.getByRole("button", { name: "Start tour", exact: true })).toHaveCount(0);
  await expect.poll(async () => (await readAudio(page)).zooms.length, { timeout: 15000 }).toBeGreaterThan(0);
  expect((await readAudio(page)).menuOpen).toHaveLength(1);
  await page.getByRole("button", { name: "Skip tour", exact: true }).click();
  await expect(main).toHaveAttribute("data-tour-active", "false");
});

test("turning on reduced motion dismisses an unstarted automatic tour", async ({ page }) => {
  await observeAudio(page, { introSeen: true });
  await page.goto("/?lang=en&source=demo");
  const cdp = await page.context().newCDPSession(page);
  await expect.poll(() => readBeforeGesture(cdp), { timeout: 20000 }).toMatchObject({ tourPhase: "prompt", startCount: 1 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => readBeforeGesture(cdp)).toMatchObject({ tourPhase: "idle", tourActive: "false", startCount: 0, menuVisible: true, zoomCount: 0, hasBeenActive: false });
  await cdp.detach();
});

test("a saved mute choice lets the automatic tour proceed without prompting or allocating audio", async ({ page }) => {
  await observeAudio(page, { muted: true });
  const requests: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/audio/")) requests.push(request.url()); });
  await page.goto("/?lang=en&source=demo");
  const main = page.locator("main");
  await expect(main).toHaveAttribute("data-tour-active", "true", { timeout: 20000 });
  await expect(main).toHaveAttribute("data-tour-phase", /^(arriving|holding)$/);
  await expect(page.getByRole("button", { name: "Start tour", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enter universe", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Skip tour", exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  expect(await readAudio(page)).toEqual({ zooms: [], menuOpen: [], voiceCount: 0, music: [] });
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Skip tour", exact: true }).click();
  await expect(main).toHaveAttribute("data-tour-active", "false");
});
