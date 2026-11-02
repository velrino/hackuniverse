import { expect, test } from "@playwright/test";

type Sample = { at: number; distance: number; stage: string };
type ProbedWindow = Window & { earthTourSamples: Sample[] };

test.use({ reducedMotion: "no-preference", deviceScaleFactor: 1 });

test("the proportional automatic tour leaves Earth without a camera-distance jump", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("hackuniverse.intro.v1.seen", "1");
    localStorage.removeItem("hackuniverse.demo-tour.v1.seen");
    localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({ schemaVersion: 1, muted: true, musicEnabled: false, effectsEnabled: false, musicVolume: 0.35, effectsVolume: 0.5 }));
    const samples: Sample[] = [];
    (window as unknown as ProbedWindow).earthTourSamples = samples;
    const names = new WeakMap<WebGLUniformLocation, string>();
    const radius = 6371 * 3.4 / 695700;
    for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const getLocation = prototype.getUniformLocation;
      prototype.getUniformLocation = function (program, name) {
        const location = getLocation.call(this, program, name);
        if (location) names.set(location, name);
        return location;
      };
      const matrix = prototype.uniformMatrix4fv;
      prototype.uniformMatrix4fv = function (this: WebGLRenderingContext | WebGL2RenderingContext, location: WebGLUniformLocation | null, transpose: boolean, data: Float32List) {
        // Observe the actual rendered Earth's model-view matrix, including the
        // camera clamp. The mathematical dolly alone cannot expose this bug.
        if (location && names.get(location) === "modelViewMatrix" && data && samples.length < 5000) {
          const scale = Math.hypot(data[0], data[1], data[2]);
          if (Math.abs(scale - radius) < radius * 0.001) samples.push({
            at: performance.now(), distance: Math.hypot(data[12], data[13], data[14]),
            stage: document.querySelector(".universe-tour-status")?.textContent ?? "",
          });
        }
        return matrix.call(this, location, transpose, data);
      };
    }
  });
  await page.goto("/?lang=en&source=demo&scale=proportional");
  await expect(page.locator(".universe-tour-status")).toContainText("Solar System", { timeout: 20000 });
  await page.waitForTimeout(1200);
  const samples = await page.evaluate(() => (window as unknown as ProbedWindow).earthTourSamples);
  await testInfo.attach("rendered-earth-tour-distances", { body: JSON.stringify(samples), contentType: "application/json" });
  const boundary = samples.findIndex((sample) => sample.stage.includes("Solar System"));
  expect(boundary).toBeGreaterThan(0);
  const crossing = samples.slice(boundary - 1).filter((sample) => sample.at <= samples[boundary].at + 1100);
  expect(crossing.length).toBeGreaterThan(2);
  expect(crossing[0].distance).toBeLessThan(1);
  for (let index = 1; index < crossing.length; index++) {
    const before = crossing[index - 1];
    const after = crossing[index];
    const allowed = Math.exp(0.9 * (after.at - before.at) / 1000) * 1.25;
    expect(after.distance / before.distance, "rendered Earth jumped away during the tour handoff").toBeLessThan(allowed);
  }
});
