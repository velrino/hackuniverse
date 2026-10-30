import { expect, test, type Page } from "@playwright/test";

type CameraVoice = { duration: number; started: number; stopped: number | null; fadeMs: number | null; ended: number | null; startContext: number; stopContext: number | null };
type TouchPointer = { pointerId: number; startX: number; startY: number; x: number; y: number };
type TouchPointerEvent = { type: string; pointerId: number; x: number; y: number };
type TouchProbe = { active: TouchPointer[]; events: TouchPointerEvent[] };
type ProbedWindow = Window & { cameraAudioProbe: CameraVoice[]; cameraWheelProbe: number[]; cameraWheelAudioProbe: (number | null)[]; cameraAudioQuantumMs: number; cameraPointerInput: number | null; cameraAudioClock: () => number; cameraTouchProbe: TouchProbe };

async function voices(page: Page) {
  return page.evaluate(() => (window as unknown as ProbedWindow).cameraAudioProbe);
}

async function prepareCamera(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("hackuniverse.intro.v1.seen", "1");
    localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({ schemaVersion: 1, musicEnabled: false, effectsEnabled: true, musicVolume: 0.35, effectsVolume: 0.5 }));
    const records: CameraVoice[] = [];
    (window as unknown as ProbedWindow).cameraAudioProbe = records;
    (window as unknown as ProbedWindow).cameraWheelProbe = [];
    (window as unknown as ProbedWindow).cameraWheelAudioProbe = [];
    (window as unknown as ProbedWindow).cameraPointerInput = null;
    document.addEventListener("wheel", (event) => {
      if (event.isTrusted) {
        const probe = window as unknown as ProbedWindow;
        probe.cameraWheelProbe.push(performance.now());
        probe.cameraWheelAudioProbe.push(typeof probe.cameraAudioClock === "function" ? probe.cameraAudioClock() : null);
      }
    }, true);
    document.addEventListener("pointermove", (event) => {
      if (event.isTrusted && event.buttons !== 0) (window as unknown as ProbedWindow).cameraPointerInput = performance.now();
    }, true);
    const touchPointers = new Map<number, TouchPointer>();
    const touchEvents: TouchPointerEvent[] = [];
    const touchProbe: TouchProbe = { active: [], events: touchEvents };
    (window as unknown as ProbedWindow).cameraTouchProbe = touchProbe;
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const) {
      document.addEventListener(type, (event) => {
        if (!event.isTrusted || event.pointerType !== "touch") return;
        touchEvents.push({ type, pointerId: event.pointerId, x: event.clientX, y: event.clientY });
        if (type === "pointerdown") touchPointers.set(event.pointerId, { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY });
        else if (type === "pointermove") {
          const pointer = touchPointers.get(event.pointerId);
          if (pointer) { pointer.x = event.clientX; pointer.y = event.clientY; }
        } else touchPointers.delete(event.pointerId);
        touchProbe.active = [...touchPointers.values()];
      }, true);
    }
    const tracked = new WeakMap<AudioBufferSourceNode, CameraVoice>();
    const start = AudioBufferSourceNode.prototype.start;
    const stop = AudioBufferSourceNode.prototype.stop;
    // Observe actual Web Audio resource lifetime, without replacing the engine.
    AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
      if (this.buffer && this.buffer.duration > 2 && this.buffer.duration < 6) {
        const record: CameraVoice = { duration: this.buffer.duration, started: performance.now(), stopped: null, fadeMs: null, ended: null, startContext: Math.max(when ?? this.context.currentTime, this.context.currentTime), stopContext: null };
        records.push(record); tracked.set(this, record);
        (window as unknown as ProbedWindow).cameraAudioClock = () => this.context.currentTime;
        (window as unknown as ProbedWindow).cameraAudioQuantumMs = 128 / this.context.sampleRate * 1000;
        this.addEventListener("ended", () => { record.ended = performance.now(); }, { once: true });
      }
      return start.call(this, when, offset, duration);
    };
    AudioBufferSourceNode.prototype.stop = function (when) {
      const record = tracked.get(this);
      if (record) {
        record.stopped = performance.now();
        record.fadeMs = Math.max(0, ((when ?? this.context.currentTime) - this.context.currentTime) * 1000);
      }
      if (record) record.stopContext = Math.max(when ?? this.context.currentTime, this.context.currentTime);
      return stop.call(this, when);
    };
  });
  await page.goto("/?lang=en&source=demo&target=planet-earth&camera=1.865798,5.83956,9.92779,0,0,0");
  await page.getByRole("button", { name: "Explorer menu", exact: true }).click();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("group", { name: "Sound", exact: true }).getByRole("status").filter({ hasText: /^Ready$/ })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  return page.locator("canvas").evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    for (const y of [0.35, 0.45, 0.55]) for (const x of [0.2, 0.35, 0.45]) {
      const point = { x: rect.x + rect.width * x, y: rect.y + rect.height * y };
      if (document.elementFromPoint(point.x, point.y) === canvas) return point;
    }
    throw new Error("No unobscured camera gesture target");
  });
}

test("camera sound expires while holding still, stops on release, and stays silent during destination tweens", async ({ page }) => {
  const point = await prepareCamera(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 45, point.y + 20, { steps: 4 });
  await expect.poll(async () => (await voices(page)).length).toBeGreaterThan(0);
  await expect.poll(async () => (await voices(page)).every((voice) => voice.ended !== null)).toBe(true);
  const firstMovement = await voices(page);
  const lastMovement = await page.evaluate(() => (window as unknown as ProbedWindow).cameraPointerInput);
  expect(lastMovement).not.toBeNull();
  // Delivery gaps or an angular clamp can end a source before the final DOM
  // input. Check the final audible tail, without assuming one orbit source.
  expect(Math.max(...firstMovement.map((voice) => voice.ended!)) - lastMovement!).toBeLessThan(230);
  const beforeResume = firstMovement.length;
  await page.mouse.move(point.x + 75, point.y + 30, { steps: 2 });
  await expect.poll(async () => (await voices(page)).length).toBeGreaterThan(beforeResume);
  const released = await page.evaluate(() => performance.now());
  await page.mouse.up();
  await expect.poll(async () => (await voices(page)).every((voice) => voice.ended !== null)).toBe(true);
  const resumed = (await voices(page)).slice(beforeResume);
  expect(resumed.at(-1)!.ended! - released).toBeLessThan(250);

  await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await voices(page)).some((voice) => voice.duration > 5)).toBe(true);
  await expect.poll(async () => (await voices(page)).find((voice) => voice.duration > 5)?.ended).not.toBeNull();
  const zoom = (await voices(page)).find((voice) => voice.duration > 5)!;
  expect(zoom.ended! - zoom.started).toBeLessThan(350);
  const beforeNavigation = (await voices(page)).length;
  const beforeScale = await page.locator("main").getAttribute("data-scale");
  await page.locator("button.universe-scale-back").click();
  await expect(page.locator("main")).not.toHaveAttribute("data-scale", beforeScale!);
  await page.waitForTimeout(400);
  expect((await voices(page)).length).toBe(beforeNavigation);
});

test("fourteen wheel ticks over two seconds end actual zoom sources after input stops in either direction", async ({ page }, testInfo) => {
  const point = await prepareCamera(page);
  await page.mouse.move(point.x, point.y);
  const measurements: object[] = [];
  for (const [direction, delta] of [["out", 100], ["in", -100]] as const) {
    await test.step(`14 ${direction} ticks, followed by complete silence`, async () => {
      const before = (await voices(page)).length;
      const beforeWheels = await page.evaluate(() => (window as unknown as ProbedWindow).cameraWheelProbe.length);
      const started = Date.now();
      for (let index = 0; index < 14; index++) {
        const remaining = started + index * 140 - Date.now();
        if (remaining > 0) await page.waitForTimeout(remaining);
        await page.mouse.wheel(0, delta);
      }
      const { wheelTimes, audioTimes, quantumMs } = await page.evaluate((offset) => {
        const probe = window as unknown as ProbedWindow;
        return { wheelTimes: probe.cameraWheelProbe.slice(offset), audioTimes: probe.cameraWheelAudioProbe.slice(offset), quantumMs: probe.cameraAudioQuantumMs };
      }, beforeWheels);
      expect(wheelTimes).toHaveLength(14);
      const lastInput = wheelTimes.at(-1)!;
      const now = await page.evaluate(() => performance.now());
      await page.waitForTimeout(Math.max(0, lastInput + 230 - now));
      await expect.poll(async () => (await voices(page)).slice(before).filter((voice) => voice.duration > 5).every((voice) => voice.ended !== null), { timeout: 1000 }).toBe(true);
      const zooms = (await voices(page)).slice(before).filter((voice) => voice.duration > 5);
      const gaps = wheelTimes.slice(1).map((time, index) => time - wheelTimes[index]);
      const inputSegments = 1 + gaps.filter((gap) => gap >= 180).length;
      await testInfo.attach(`fourteen-wheel-${direction}-raw-timing`, {
        body: JSON.stringify({ direction, wheelTimes, audioTimes, quantumMs, gaps, inputSegments, zooms }, null, 2),
        contentType: "application/json",
      });
      expect(zooms.length).toBeGreaterThan(0);
      expect(zooms.length).toBeLessThanOrEqual(inputSegments);
      if (inputSegments === 1) expect(zooms).toHaveLength(1);
      expect(zooms.every((voice) => voice.stopped !== null && voice.ended !== null)).toBe(true);
      const lastAudioInput = audioTimes.at(-1);
      expect(lastAudioInput).not.toBeNull();
      const nativeTailMs = (Math.max(...zooms.map((voice) => voice.stopContext!)) - lastAudioInput!) * 1000;
      // The audio clock owns the audible 180 ms hold + 20 ms fade. ended is a
      // later JS notification, so its dispatch gets a separate bounded allowance.
      expect(nativeTailMs).toBeLessThanOrEqual(200 + quantumMs);
      const notificationTailMs = Math.max(...zooms.map((voice) => voice.ended!)) - lastInput;
      expect(notificationTailMs).toBeLessThan(350);

      let longestOverlapMs = 0;
      for (let index = 1; index < zooms.length; index++) {
        const previous = zooms[index - 1];
        expect(previous.stopContext).not.toBeNull();
        longestOverlapMs = Math.max(longestOverlapMs, (previous.stopContext! - zooms[index].startContext) * 1000);
      }
      // Browser delivery can pause beyond the 180 ms lease during a scale
      // change. Only such a real input gap may permit a fresh source.
      expect(longestOverlapMs).toBeLessThanOrEqual(25);
      const completed = (await voices(page)).length;
      await page.waitForTimeout(400);
      expect((await voices(page)).length).toBe(completed);
      measurements.push({ direction, wheelEvents: wheelTimes.length, inputDurationMs: wheelTimes.at(-1)! - wheelTimes[0], inputSegments, sourceCount: zooms.length, nativeTailMs, notificationTailMs, quantumMs, longestOverlapMs });
    });
  }
  await testInfo.attach("fourteen-wheel-audio-lifetime", { body: JSON.stringify(measurements, null, 2), contentType: "application/json" });
});

test("the native audio deadline expires while JavaScript and its ended callbacks are blocked", async ({ page }, testInfo) => {
  type Measurement = { before: number; after: number; deadline: number; endedWhileBlocked: number | null; blockedMs: number; sourceCount: number };
  type StallProbe = ProbedWindow & { nativeAudioStall: Measurement | { error: string } | null };
  const point = await prepareCamera(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await voices(page)).filter((voice) => voice.duration > 5).length).toBe(1);
  await page.evaluate(() => {
    const probe = window as unknown as StallProbe;
    probe.nativeAudioStall = null;
    const blockAfterCameraInput = (event: WheelEvent) => {
      if (!event.isTrusted) return;
      document.removeEventListener("wheel", blockAfterCameraInput);
      // The app's canvas listener has already armed this wheel's native stop.
      // Inspect and block in that same task, before a slow CI protocol roundtrip
      // can spend the entire lease. An earlier source may already have expired.
      const zooms = probe.cameraAudioProbe.filter((voice) => voice.duration > 5);
      const record = zooms.at(-1);
      const before = probe.cameraAudioClock();
      if (!record || record.stopContext === null || record.stopContext <= before || record.ended !== null) {
        probe.nativeAudioStall = { error: "The wheel did not arm a live native camera audio deadline" };
        return;
      }
      const deadline = record.stopContext;
      const started = performance.now();
      while (performance.now() - started < 700) { /* Simulate a busy rendering/application task. */ }
      probe.nativeAudioStall = { before, after: probe.cameraAudioClock(), deadline, endedWhileBlocked: record.ended, blockedMs: performance.now() - started, sourceCount: zooms.length };
    };
    document.addEventListener("wheel", blockAfterCameraInput);
  });
  await page.mouse.wheel(0, 100);
  await expect.poll(() => page.evaluate(() => (window as unknown as StallProbe).nativeAudioStall)).not.toBeNull();
  const measured = await page.evaluate(() => (window as unknown as StallProbe).nativeAudioStall);
  if (!measured || "error" in measured) throw new Error(measured?.error ?? "The native audio stall was not observed");
  expect(measured.deadline - measured.before).toBeGreaterThan(0);
  expect(measured.deadline - measured.before).toBeLessThan(0.23);
  expect(measured.after).toBeGreaterThan(measured.deadline + 0.3);
  expect(measured.endedWhileBlocked).toBeNull();
  await expect.poll(async () => (await voices(page)).filter((voice) => voice.duration > 5).every((voice) => voice.ended !== null)).toBe(true);
  expect((await voices(page)).filter((voice) => voice.duration > 5)).toHaveLength(measured.sourceCount);
  await testInfo.attach("native-clock-cutoff-during-js-stall", { body: JSON.stringify(measured, null, 2), contentType: "application/json" });
});

test("a trusted wheel event delivered two seconds late cannot restart camera sound", async ({ page, context }) => {
  const point = await prepareCamera(page);
  await page.mouse.move(point.x, point.y);
  const before = (await voices(page)).length;
  const beforeWheels = await page.evaluate(() => (window as unknown as ProbedWindow).cameraWheelProbe.length);
  const cdp = await context.newCDPSession(page);
  try {
    const pageAge = await page.evaluate(() => performance.now());
    if (pageAge < 2200) await page.waitForTimeout(2200 - pageAge);
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseWheel", x: point.x, y: point.y,
      deltaX: 0, deltaY: 100, timestamp: Date.now() / 1000 - 2,
    });
    // This probe records isTrusted events only: the old event really reaches
    // the application, rather than merely being rejected by a synthetic test.
    await expect.poll(() => page.evaluate(() => (window as unknown as ProbedWindow).cameraWheelProbe.length)).toBe(beforeWheels + 1);
    await page.waitForTimeout(250);
    expect((await voices(page)).slice(before).filter((voice) => voice.duration > 5)).toHaveLength(0);

    await page.mouse.wheel(0, 100);
    await expect.poll(async () => (await voices(page)).slice(before).filter((voice) => voice.duration > 5).length).toBeGreaterThan(0);
    await expect.poll(async () => (await voices(page)).slice(before).every((voice) => voice.ended !== null)).toBe(true);
  } finally { await cdp.detach(); }
});

test("touch pinch cancellation and finger release stop only their camera feedback", async ({ page, context }, testInfo) => {
  const point = await prepareCamera(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  const fingers = (spread: number) => [{ id: 0, x: point.x, y: point.y }, { id: 1, x: point.x + spread, y: point.y }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(35) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(65) });
  await expect.poll(async () => (await voices(page)).some((voice) => voice.duration > 5)).toBe(true);
  const cancelled = await page.evaluate(() => performance.now());
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await expect.poll(async () => (await voices(page)).every((voice) => voice.ended !== null)).toBe(true);
  expect((await voices(page)).every((voice) => voice.duration > 5)).toBe(true);
  expect((await voices(page)).every((voice) => voice.ended! - cancelled < 250)).toBe(true);

  const beforeSecondPinch = (await voices(page)).length;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(35) });
  await expect.poll(() => page.evaluate(() => (window as unknown as ProbedWindow).cameraTouchProbe.active.length)).toBe(2);
  const startedPointers = await page.evaluate(() => (window as unknown as ProbedWindow).cameraTouchProbe.active);
  const cdpIds = new Map(startedPointers.map((pointer) => [pointer.pointerId, Math.abs(pointer.startX - point.x) < Math.abs(pointer.startX - (point.x + 35)) ? 0 : 1]));
  expect(new Set(cdpIds.values()).size).toBe(2);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(65) });
  await expect.poll(async () => (await voices(page)).length).toBeGreaterThan(beforeSecondPinch);
  // CDP/platform versions differ on whether nonempty touchEnd identifies the
  // lifted or retained contact. Follow the actual trusted pointerup inventory.
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [{ id: 1, x: point.x + 65, y: point.y }] });
  await expect.poll(() => page.evaluate(() => (window as unknown as ProbedWindow).cameraTouchProbe.active.length)).toBe(1);
  const remaining = await page.evaluate(() => (window as unknown as ProbedWindow).cameraTouchProbe.active[0]);
  const remainingCdpId = cdpIds.get(remaining.pointerId);
  expect(remainingCdpId).toBeDefined();
  await expect.poll(async () => (await voices(page)).every((voice) => voice.ended !== null)).toBe(true);
  const beforeDrag = (await voices(page)).length;
  const downsBeforeDrag = await page.evaluate(() => (window as unknown as ProbedWindow).cameraTouchProbe.events.filter((event) => event.type === "pointerdown").length);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: remainingCdpId!, x: remaining.x + 40, y: remaining.y + 15 }] });
  await expect.poll(() => page.evaluate(({ pointerId, x }) => (window as unknown as ProbedWindow).cameraTouchProbe.events.some((event) => event.type === "pointermove" && event.pointerId === pointerId && Math.abs(event.x - x) < 1), { pointerId: remaining.pointerId, x: remaining.x + 40 })).toBe(true);
  const continued = await page.evaluate(() => (window as unknown as ProbedWindow).cameraTouchProbe);
  await testInfo.attach("partial-touch-release-inventory", { body: JSON.stringify({ startedPointers, remaining, remainingCdpId, continued }, null, 2), contentType: "application/json" });
  expect(continued.active.map((pointer) => pointer.pointerId)).toEqual([remaining.pointerId]);
  expect(continued.events.filter((event) => event.type === "pointerdown")).toHaveLength(downsBeforeDrag);
  await expect.poll(async () => (await voices(page)).length).toBeGreaterThan(beforeDrag);
  const released = await page.evaluate(() => performance.now());
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(async () => (await voices(page)).every((voice) => voice.ended !== null)).toBe(true);
  const drag = (await voices(page))[beforeDrag];
  expect(drag.duration).toBeLessThan(3);
  expect(drag.ended! - released).toBeLessThan(250);
  await cdp.detach();
});
