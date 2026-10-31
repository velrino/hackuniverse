import { expect, test, type CDPSession, type Page } from "@playwright/test";

type TourVoice = { duration: number; started: number; ended: number | null; stopContext: number | null };
type TourMusic = { media: HTMLMediaElement; context: AudioContext };
type TourAudioProbe = { voices: TourVoice[]; music: TourMusic[]; effectsContext: BaseAudioContext | null; skip: { at: number; audioAt: number; quantum: number } | null };
type ProbedWindow = Window & { tourAudioProbe: TourAudioProbe };
type InitialState = { tourPhase: string | null; tourActive: string | null; introPhase: string | null; sceneBusy: string | null; hasBeenActive: boolean; startCount: number; entryCount: number; menuPoint: { x: number; y: number } | null; skipPoint: { x: number; y: number } | null; menuVisible: boolean; zoomCount: number; menuOpenCount: number; music: { paused: boolean; contextState: string }[] };

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

async function observeAudio(page: Page, { muted = false, introSeen = false, tourSeen = false } = {}) {
  await page.addInitScript(({ muted, introSeen, tourSeen }) => {
    if (introSeen) localStorage.setItem("hackuniverse.intro.v1.seen", "1");
    if (tourSeen) localStorage.setItem("hackuniverse.demo-tour.v1.seen", "1");
    if (muted) localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({ schemaVersion: 1, musicEnabled: false, effectsEnabled: false, musicVolume: 0.35, effectsVolume: 0.5 }));
    const probe: TourAudioProbe = { voices: [], music: [], effectsContext: null, skip: null };
    (window as unknown as ProbedWindow).tourAudioProbe = probe;
    const mediaSource = AudioContext.prototype.createMediaElementSource;
    AudioContext.prototype.createMediaElementSource = function (media) {
      const source = mediaSource.call(this, media);
      probe.music.push({ media, context: this });
      return source;
    };
    const start = AudioBufferSourceNode.prototype.start;
    const stop = AudioBufferSourceNode.prototype.stop;
    const tracked = new WeakMap<AudioBufferSourceNode, TourVoice>();
    AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
      if (this.buffer) {
        const voice: TourVoice = { duration: this.buffer.duration, started: performance.now(), ended: null, stopContext: null };
        probe.voices.push(voice);
        tracked.set(this, voice);
        probe.effectsContext = this.context;
        this.addEventListener("ended", () => { voice.ended = performance.now(); }, { once: true });
      }
      return start.call(this, when, offset, duration);
    };
    AudioBufferSourceNode.prototype.stop = function (when) {
      const voice = tracked.get(this);
      if (voice) voice.stopContext = Math.max(when ?? this.context.currentTime, this.context.currentTime);
      return stop.call(this, when);
    };
    document.addEventListener("click", (event) => {
      if (!event.isTrusted || !(event.target instanceof Element) || !probe.effectsContext) return;
      if (event.target.closest("button")?.textContent?.trim() !== "Skip tour") return;
      probe.skip = { at: performance.now(), audioAt: probe.effectsContext.currentTime, quantum: 128 / probe.effectsContext.sampleRate };
    }, true);
  }, { muted, introSeen, tourSeen });
}

async function readAudio(page: Page) {
  return page.evaluate(() => {
    const probe = (window as unknown as ProbedWindow).tourAudioProbe;
    return {
      // Muted zoom assets retain their duration and native voice lifecycle.
      zooms: probe.voices.filter((voice) => voice.duration > 5),
      // The imported menu-open alias is the only active effect in this range.
      menuOpen: probe.voices.filter((voice) => voice.duration > 1.4 && voice.duration < 1.7),
      voiceCount: probe.voices.length,
      skip: probe.skip,
      effectsState: probe.effectsContext?.state ?? null,
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
      const skip = buttons.find(button => button.textContent.trim() === 'Skip tour');
      const point = button => {
        if (!button?.getClientRects().length) return null;
        const rect = button.getBoundingClientRect();
        return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
      };
      return {
        tourPhase: main?.getAttribute('data-tour-phase') ?? null,
        tourActive: main?.getAttribute('data-tour-active') ?? null,
        introPhase: document.querySelector('[data-application-intro]')?.getAttribute('data-application-intro') ?? null,
        sceneBusy: document.querySelector('.universe-scene[aria-busy]')?.getAttribute('aria-busy') ?? null,
        hasBeenActive: navigator.userActivation?.hasBeenActive ?? false,
        startCount: buttons.filter(button => button.textContent.trim() === 'Start tour').length,
        entryCount: buttons.filter(button => button.textContent.trim() === 'Enter universe').length,
        menuPoint: point(menu),
        skipPoint: point(skip),
        menuVisible: Boolean(menu?.getClientRects().length),
        zoomCount: probe?.voices.filter(voice => voice.duration > 5).length ?? 0,
        menuOpenCount: probe?.voices.filter(voice => voice.duration > 1.4 && voice.duration < 1.7).length ?? 0,
        music: probe?.music.map(({media, context}) => ({paused: media.paused, contextState: context.state})) ?? []
      };
    })()`,
  });
  if (result.exceptionDetails) throw new Error("Unable to observe the native autoplay boundary");
  return result.result.value as InitialState;
}

test("a manual tour preserves the sound mix and releases camera voices when skipped", async ({ page, isMobile }, testInfo) => {
  await observeAudio(page, { introSeen: true, tourSeen: true });
  await page.goto("/?lang=en&source=demo");
  const cdp = await page.context().newCDPSession(page);
  await expect.poll(() => readBeforeGesture(cdp), { timeout: 20000 }).toMatchObject({ introPhase: "ready", sceneBusy: "false", tourPhase: "idle", tourActive: "false", startCount: 0, entryCount: 0 });
  const initial = await readBeforeGesture(cdp);
  expect(initial.hasBeenActive).toBe(false);
  expect(initial.zoomCount).toBe(0);
  expect(initial.music.every((music) => music.paused || music.contextState !== "running")).toBe(true);
  expect(initial.menuPoint).not.toBeNull();
  await cdp.detach();
  const main = page.locator("main");

  if (isMobile) await page.touchscreen.tap(initial.menuPoint!.x, initial.menuPoint!.y);
  else await page.mouse.click(initial.menuPoint!.x, initial.menuPoint!.y);
  await page.getByRole("dialog", { name: "Mission controls", exact: true }).getByRole("button", { name: "Tour", exact: true }).click();
  await expect(main).toHaveAttribute("data-tour-active", "true");
  await expect.poll(async () => (await readAudio(page)).music.some((music) => !music.paused && music.contextState === "running"), { timeout: 15000 }).toBe(true);
  await expect.poll(async () => {
    const [audio, phase] = await Promise.all([readAudio(page), main.getAttribute("data-tour-phase")]);
    return phase === "arriving" && audio.zooms.some((voice) => voice.ended === null);
  }, { timeout: 15000 }).toBe(true);

  await page.getByRole("button", { name: "Mute sound", exact: true }).click();
  await expect(main).toHaveAttribute("data-tour-active", "true");
  await expect.poll(async () => {
    const audio = await readAudio(page);
    return audio.effectsState === "suspended" && audio.music.every((music) => music.paused);
  }).toBe(true);
  const mutedSources = (await readAudio(page)).zooms.length;
  await page.waitForTimeout(400);
  await expect(main).toHaveAttribute("data-tour-active", "true");
  expect((await readAudio(page)).zooms).toHaveLength(mutedSources);
  await page.getByRole("button", { name: "Enable sound", exact: true }).click();
  await expect(main).toHaveAttribute("data-tour-active", "true");
  await expect.poll(async () => (await readAudio(page)).music.some((music) => !music.paused && music.contextState === "running"), { timeout: 15000 }).toBe(true);
  await expect.poll(async () => {
    const [audio, phase] = await Promise.all([readAudio(page), main.getAttribute("data-tour-phase")]);
    return phase === "arriving" && audio.zooms.slice(mutedSources).some((voice) => voice.ended === null);
  }, { timeout: 15000 }).toBe(true);

  const musicBeforeSkip = (await readAudio(page)).music.find((music) => !music.paused && music.contextState === "running")!.currentTime;
  await page.getByRole("button", { name: "Skip tour", exact: true }).click();
  await expect(main).toHaveAttribute("data-tour-active", "false");
  await expect(main).toHaveAttribute("data-tour-phase", "idle");
  await expect.poll(async () => (await readAudio(page)).zooms.every((voice) => voice.ended !== null)).toBe(true);
  const stopped = await readAudio(page);
  await testInfo.attach("tour-skip-native-deadlines", { body: JSON.stringify({ click: stopped.skip, zooms: stopped.zooms }, null, 2), contentType: "application/json" });
  expect(stopped.skip).not.toBeNull();
  expect(stopped.zooms.every((voice) => voice.stopContext !== null)).toBe(true);
  // The paired native clock measures the handler's release deadline. Driver
  // actionability waits and delayed JS ended callbacks are outside this bound.
  expect(Math.max(...stopped.zooms.map((voice) => voice.stopContext!)) - stopped.skip!.audioAt).toBeLessThanOrEqual(0.03 + stopped.skip!.quantum);
  expect(stopped.zooms.filter((voice) => voice.started > stopped.skip!.at)).toHaveLength(0);
  await page.waitForTimeout(400);
  expect((await readAudio(page)).zooms).toHaveLength(stopped.zooms.length);
  await expect.poll(async () => (await readAudio(page)).music.some((music) => !music.paused && music.contextState === "running" && music.currentTime > musicBeforeSkip + 0.1)).toBe(true);
});

test("blocked autoplay never gates the tour and a late gesture cannot replay the startup cue", async ({ page, isMobile }) => {
  await observeAudio(page);
  await page.goto("/?lang=en&source=demo");
  const cdp = await page.context().newCDPSession(page);
  await expect.poll(() => readBeforeGesture(cdp)).toMatchObject({ introPhase: "loading", entryCount: 0, startCount: 0, hasBeenActive: false });
  await expect.poll(() => readBeforeGesture(cdp), { timeout: 20000 }).toMatchObject({ introPhase: "ready", sceneBusy: "false", tourActive: "true", entryCount: 0, startCount: 0, hasBeenActive: false, menuOpenCount: 0 });
  const initial = await readBeforeGesture(cdp);
  expect(initial.zoomCount).toBe(0);
  expect(initial.music.every((music) => music.paused || music.contextState !== "running")).toBe(true);
  expect(initial.skipPoint).not.toBeNull();
  await cdp.detach();

  // This ordinary control is the first actual activation. It must not summon
  // either entry overlay or a startup sound whose loading window has ended.
  if (isMobile) await page.touchscreen.tap(initial.skipPoint!.x, initial.skipPoint!.y);
  else await page.mouse.click(initial.skipPoint!.x, initial.skipPoint!.y);
  await expect(page.locator("main")).toHaveAttribute("data-tour-active", "false");
  await expect.poll(async () => (await readAudio(page)).music.some((music) => !music.paused && music.contextState === "running"), { timeout: 15000 }).toBe(true);
  await expect(page.locator(".application-intro-entry, .universe-tour-entry")).toHaveCount(0);
  await page.waitForTimeout(500);
  expect((await readAudio(page)).menuOpen).toHaveLength(0);
});

test("reduced motion suppresses the automatic tour without displaying an entry prompt", async ({ page }) => {
  await observeAudio(page, { introSeen: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?lang=en&source=demo");
  const cdp = await page.context().newCDPSession(page);
  await expect.poll(() => readBeforeGesture(cdp), { timeout: 20000 }).toMatchObject({ introPhase: "ready", sceneBusy: "false", tourPhase: "idle", tourActive: "false", startCount: 0, entryCount: 0, menuVisible: true, zoomCount: 0, menuOpenCount: 0, hasBeenActive: false });
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
  expect(await readAudio(page)).toEqual({ zooms: [], menuOpen: [], voiceCount: 0, skip: null, effectsState: null, music: [] });
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Skip tour", exact: true }).click();
  await expect(main).toHaveAttribute("data-tour-active", "false");
});
