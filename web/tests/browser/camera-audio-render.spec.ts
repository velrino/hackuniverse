import { expect, test } from "@playwright/test";

type AudioCapture = { context: AudioContext; source: AudioNode; samples: { at: number; rms: number }[]; startedAt: number };
type CaptureWindow = Window & { cameraCapture?: AudioCapture };

test("camera output becomes silent even while rendering blocks JavaScript cleanup", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("hackuniverse.intro.v1.seen", "1");
    localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({ schemaVersion: 1, musicEnabled: false, effectsEnabled: true, musicVolume: 0.35, effectsVolume: 0.5 }));
    const original = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, destination: AudioNode | AudioParam, ...ports: number[]) {
      const host = window as unknown as CaptureWindow;
      if (!host.cameraCapture && destination instanceof AudioDestinationNode && this.context instanceof AudioContext) {
        host.cameraCapture = { context: this.context, source: this, samples: [], startedAt: 0 };
      }
      return Reflect.apply(original, this, [destination, ...ports]);
    } as AudioNode["connect"];
  });
  await page.goto("/?lang=en&source=demo&target=planet-earth&camera=1.865798,5.83956,9.92779,0,0,0");
  await page.getByRole("button", { name: "Explorer menu", exact: true }).click();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("group", { name: "Sound", exact: true }).getByRole("status").filter({ hasText: /^Ready$/ })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForTimeout(1100); // Finish the separate menu-closing effect.
  const point = await page.locator("canvas").evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    for (const y of [0.35, 0.45, 0.55]) for (const x of [0.2, 0.35, 0.45]) {
      const point = { x: rect.x + rect.width * x, y: rect.y + rect.height * y };
      if (document.elementFromPoint(point.x, point.y) === canvas) return point;
    }
    throw new Error("No unobscured camera target");
  });
  await page.mouse.move(point.x, point.y);
  await page.evaluate(async () => {
    const capture = (window as unknown as CaptureWindow).cameraCapture!;
    // Timestamp PCM on the audio rendering thread; JS message delivery may stall.
    const moduleUrl = URL.createObjectURL(new Blob([`
      class CameraOutput extends AudioWorkletProcessor {
        blocks = 0; energy = 0; length = 0;
        process(inputs) {
          const channel = inputs[0]?.[0];
          if (channel) { for (const sample of channel) this.energy += sample * sample; this.length += channel.length; }
          if (++this.blocks === 8) {
            this.port.postMessage({at: currentTime, rms: Math.sqrt(this.energy / Math.max(1, this.length))});
            this.blocks = 0; this.energy = 0; this.length = 0;
          }
          return true;
        }
      }
      registerProcessor('camera-output', CameraOutput);
    `], { type: "text/javascript" }));
    try { await capture.context.audioWorklet.addModule(moduleUrl); } finally { URL.revokeObjectURL(moduleUrl); }
    const observer = new AudioWorkletNode(capture.context, "camera-output");
    observer.port.onmessage = (event) => capture.samples.push(event.data);
    capture.source.connect(observer);
    observer.connect(capture.context.destination); // Observer output remains silent.
    capture.startedAt = capture.context.currentTime;
  });
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(30);
  await page.evaluate(() => {
    const blockedUntil = performance.now() + 700;
    while (performance.now() < blockedUntil) { /* Deliberately block timers. */ }
  });
  await page.waitForTimeout(50);
  const measured = await page.evaluate(() => {
    const capture = (window as unknown as CaptureWindow).cameraCapture!;
    const rms = (start: number, end: number) => {
      const samples = capture.samples.filter((sample) => sample.at - capture.startedAt >= start && sample.at - capture.startedAt < end);
      return { count: samples.length, level: Math.sqrt(samples.reduce((energy, sample) => energy + sample.rms ** 2, 0) / Math.max(1, samples.length)) };
    };
    return { active: rms(0.06, 0.16), tail: rms(0.4, 0.6) };
  });
  expect(measured.active.count).toBeGreaterThan(0);
  expect(measured.tail.count).toBeGreaterThan(0);
  expect(measured.active.level).toBeGreaterThan(0.0001);
  expect(measured.tail.level).toBeLessThan(Math.max(0.00001, measured.active.level * 0.02));
});
