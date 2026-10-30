import { expect, test, type Page } from "@playwright/test";

type CameraVoice = { duration: number; started: number; stopped: number | null; fadeMs: number | null };
type ProbedWindow = Window & { cameraAudioProbe: CameraVoice[] };

async function voices(page: Page) {
  return page.evaluate(() => (window as unknown as ProbedWindow).cameraAudioProbe);
}

async function prepareCamera(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("hackuniverse.intro.v1.seen", "1");
    localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({ schemaVersion: 1, musicEnabled: false, effectsEnabled: true, musicVolume: 0.35, effectsVolume: 0.5 }));
    const records: CameraVoice[] = [];
    (window as unknown as ProbedWindow).cameraAudioProbe = records;
    const tracked = new WeakMap<AudioBufferSourceNode, CameraVoice>();
    const start = AudioBufferSourceNode.prototype.start;
    const stop = AudioBufferSourceNode.prototype.stop;
    // Observe actual Web Audio resource lifetime, without replacing the engine.
    AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
      if (this.buffer && this.buffer.duration > 2 && this.buffer.duration < 6) {
        const record = { duration: this.buffer.duration, started: performance.now(), stopped: null, fadeMs: null };
        records.push(record); tracked.set(this, record);
      }
      return start.call(this, when, offset, duration);
    };
    AudioBufferSourceNode.prototype.stop = function (when) {
      const record = tracked.get(this);
      if (record && record.stopped === null) {
        record.stopped = performance.now();
        record.fadeMs = Math.max(0, ((when ?? this.context.currentTime) - this.context.currentTime) * 1000);
      }
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
  await expect.poll(async () => (await voices(page))[0].stopped).not.toBeNull();
  const first = (await voices(page))[0];
  expect(first.stopped! - first.started).toBeLessThan(400);
  expect(first.fadeMs).toBeLessThanOrEqual(30);
  await page.mouse.move(point.x + 75, point.y + 30, { steps: 2 });
  await expect.poll(async () => (await voices(page)).length).toBeGreaterThan(1);
  const released = await page.evaluate(() => performance.now());
  await page.mouse.up();
  await expect.poll(async () => (await voices(page))[1].stopped).not.toBeNull();
  expect((await voices(page))[1].stopped! - released).toBeLessThan(250);

  await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await voices(page)).some((voice) => voice.duration > 5)).toBe(true);
  await expect.poll(async () => (await voices(page)).find((voice) => voice.duration > 5)?.stopped).not.toBeNull();
  const zoom = (await voices(page)).find((voice) => voice.duration > 5)!;
  expect(zoom.stopped! - zoom.started).toBeLessThan(350);
  const beforeNavigation = (await voices(page)).length;
  const beforeScale = await page.locator("main").getAttribute("data-scale");
  await page.locator("button.universe-scale-back").click();
  await expect(page.locator("main")).not.toHaveAttribute("data-scale", beforeScale!);
  await page.waitForTimeout(400);
  expect((await voices(page)).length).toBe(beforeNavigation);
});

test("touch pinch cancellation and finger release stop only their camera feedback", async ({ page, context }) => {
  const point = await prepareCamera(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  const fingers = (spread: number) => [{ id: 0, x: point.x, y: point.y }, { id: 1, x: point.x + spread, y: point.y }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(35) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(65) });
  await expect.poll(async () => (await voices(page)).some((voice) => voice.duration > 5)).toBe(true);
  const cancelled = await page.evaluate(() => performance.now());
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await expect.poll(async () => (await voices(page)).every((voice) => voice.stopped !== null)).toBe(true);
  expect((await voices(page)).every((voice) => voice.duration > 5)).toBe(true);
  expect((await voices(page)).every((voice) => voice.stopped! - cancelled < 250)).toBe(true);

  const beforeSecondPinch = (await voices(page)).length;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(35) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(65) });
  await expect.poll(async () => (await voices(page)).length).toBeGreaterThan(beforeSecondPinch);
  // Lift finger 1; finger 0 retains its identity for the following rotation.
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [{ id: 1, x: point.x + 65, y: point.y }] });
  await expect.poll(async () => (await voices(page)).every((voice) => voice.stopped !== null)).toBe(true);
  const beforeDrag = (await voices(page)).length;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 0, x: point.x + 40, y: point.y + 15 }] });
  await expect.poll(async () => (await voices(page)).length).toBeGreaterThan(beforeDrag);
  const released = await page.evaluate(() => performance.now());
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(async () => (await voices(page)).every((voice) => voice.stopped !== null)).toBe(true);
  const drag = (await voices(page))[beforeDrag];
  expect(drag.duration).toBeLessThan(3);
  expect(drag.stopped! - released).toBeLessThan(250);
  await cdp.detach();
});
