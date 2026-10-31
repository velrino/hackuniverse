import { expect, test } from "@playwright/test";
import { closeSoundSettings, openSoundSettings } from "./helpers/sound-settings";

type CameraVoice = { duration: number; at: number; stopAt: number | null; scheduledAt: number | null };
type AudioCapture = { context: AudioContext; source: AudioNode; samples: { at: number; rms: number }[]; voices: CameraVoice[]; startedAt: number; blockNextOrbit: boolean; blocked: { start: number; end: number } | null };
type CaptureWindow = Window & { cameraCapture?: AudioCapture };

for (const motion of ["orbit", "zoom"] as const) {
  test(motion === "orbit" ? "audible orbit feedback expires while JavaScript cleanup is blocked" : "both zoom directions remain silent while enabled effects schedule real camera voices", async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      localStorage.setItem("hackuniverse.intro.v1.seen", "1");
      localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({ schemaVersion: 1, musicEnabled: false, effectsEnabled: true, musicVolume: 0.35, effectsVolume: 0.5 }));
      const original = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (this: AudioNode, destination: AudioNode | AudioParam, ...ports: number[]) {
        const host = window as unknown as CaptureWindow;
        if (!host.cameraCapture && destination instanceof AudioDestinationNode && this.context instanceof AudioContext) {
          host.cameraCapture = { context: this.context, source: this, samples: [], voices: [], startedAt: 0, blockNextOrbit: false, blocked: null };
        }
        return Reflect.apply(original, this, [destination, ...ports]);
      } as AudioNode["connect"];
      const tracked = new WeakMap<AudioBufferSourceNode, CameraVoice>();
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
        const capture = (window as unknown as CaptureWindow).cameraCapture;
        if (this.buffer && capture) {
          const now = this.context.currentTime;
          const voice = { duration: this.buffer.duration, at: Math.max(when ?? now, now), stopAt: null, scheduledAt: null };
          tracked.set(this, voice);
          capture.voices.push(voice);
        }
        return start.call(this, when, offset, duration);
      };
      const stop = AudioBufferSourceNode.prototype.stop;
      AudioBufferSourceNode.prototype.stop = function (when) {
        const now = this.context.currentTime;
        const result = stop.call(this, when);
        const voice = tracked.get(this);
        if (voice) { voice.stopAt = Math.max(when ?? now, now); voice.scheduledAt = now; }
        const capture = (window as unknown as CaptureWindow).cameraCapture;
        if (capture?.blockNextOrbit && voice && voice.duration > 2 && voice.duration < 2.6 && voice.stopAt! > now) {
          capture.blockNextOrbit = false;
          capture.blocked = { start: this.context.currentTime, end: 0 };
          // Block only after the real audio-thread deadline has been scheduled.
          // Separate driver commands can arrive after this short voice expires.
          const blockedUntil = performance.now() + 700;
          while (performance.now() < blockedUntil) { /* Deliberately block JS cleanup. */ }
          capture.blocked.end = this.context.currentTime;
        }
        return result;
      };
    });
    await page.goto("/?lang=en&source=demo&target=planet-earth&camera=1.865798,5.83956,9.92779,0,0,0");
    const sound = await openSoundSettings(page);
    await expect(sound.getByRole("status").filter({ hasText: /^Ready$/ })).toBeVisible();
    await closeSoundSettings(page);
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
    await page.evaluate(async (motion) => {
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
      capture.blockNextOrbit = motion === "orbit";
    }, motion);
    if (motion === "orbit") {
      // Reproduce a driver gap: setup-relative PCM windows must not pass.
      await page.waitForTimeout(250);
      await page.mouse.down();
      await page.mouse.move(point.x + 48, point.y + 16);
    } else {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(30);
      await page.mouse.wheel(0, -100);
    }
    if (motion === "orbit") await page.mouse.up();
    else {
      await page.waitForTimeout(20);
      await page.evaluate(() => {
        const blockedUntil = performance.now() + 700;
        while (performance.now() < blockedUntil) { /* Deliberately block timers. */ }
      });
    }
    await page.waitForTimeout(50);
    const measured = await page.evaluate((motion) => {
      const capture = (window as unknown as CaptureWindow).cameraCapture!;
      const voices = capture.voices.filter((voice) => voice.at >= capture.startedAt && (motion === "orbit" ? voice.duration > 2 && voice.duration < 2.6 : voice.duration > 5));
      const firstStart = voices[0]?.at ?? capture.context.currentTime;
      const lastStop = Math.max(...voices.map((voice) => voice.stopAt ?? Infinity));
      const rms = (start: number, end: number) => {
        const samples = capture.samples.filter((sample) => sample.at >= start && sample.at < end);
        return { count: samples.length, level: Math.sqrt(samples.reduce((energy, sample) => energy + sample.rms ** 2, 0) / Math.max(1, samples.length)) };
      };
      return {
        active: rms(firstStart + 0.04, firstStart + 0.12), tail: rms(lastStop + 0.16, lastStop + 0.36),
        voices, blocked: capture.blocked, quantum: 128 / capture.context.sampleRate,
      };
    }, motion);
    await testInfo.attach(`${motion}-native-pcm`, { body: JSON.stringify(measured, null, 2), contentType: "application/json" });
    expect(measured.active.count).toBeGreaterThan(0);
    expect(measured.tail.count).toBeGreaterThan(0);
    if (motion === "orbit") {
      expect(measured.voices).toHaveLength(1);
      const voice = measured.voices[0];
      expect(voice.stopAt).not.toBeNull();
      expect(measured.blocked).not.toBeNull();
      expect(voice.at).toBeLessThanOrEqual(measured.blocked!.start);
      expect(voice.stopAt!).toBeGreaterThan(measured.blocked!.start);
      expect(voice.stopAt!).toBeLessThan(measured.blocked!.end);
      expect(voice.scheduledAt).not.toBeNull();
      expect(voice.stopAt! - voice.scheduledAt!).toBeLessThanOrEqual(0.14 + measured.quantum);
      expect(measured.active.level).toBeGreaterThan(0.0001);
      expect(measured.tail.level).toBeLessThan(Math.max(0.00001, measured.active.level * 0.02));
    } else {
      expect(measured.voices.filter((voice) => voice.duration > 5).length).toBeGreaterThanOrEqual(2);
      expect(measured.active.level).toBeLessThan(0.00001);
      expect(measured.tail.level).toBeLessThan(0.00001);
    }
  });
}
