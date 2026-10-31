import { expect, test } from "@playwright/test";
import { closeSoundSettings, openSoundSettings } from "./helpers/sound-settings";

type CameraVoice = { duration: number; at: number; stopAt: number | null; scheduledAt: number | null };
type CameraWheel = { direction: "in" | "out"; age: number; handledAge: number; trusted: boolean; voiceIndexes: number[] };
type AudioCapture = { context: AudioContext; source: AudioNode; samples: { at: number; rms: number }[]; voices: CameraVoice[]; wheels: CameraWheel[]; startedAt: number; blockNextOrbit: boolean; blocked: { start: number; end: number } | null };
type CaptureWindow = Window & { cameraCapture?: AudioCapture };

// Native PCM and deadlines are independent of renderer resolution. Keep the
// software-rendered surface small enough for genuine fresh input in CI.
const pcmTest = test.extend({
  deviceScaleFactor: 1,
  trace: { mode: "retain-on-failure", screenshots: false, snapshots: false },
});

for (const motion of ["orbit", "zoom"] as const) {
  pcmTest(motion === "orbit" ? "audible orbit feedback expires while JavaScript cleanup is blocked" : "both zoom directions remain silent while enabled effects schedule real camera voices", async ({ page, isMobile }, testInfo) => {
    await page.setViewportSize(isMobile ? { width: 360, height: 640 } : { width: 640, height: 480 });
    await page.addInitScript(() => {
      localStorage.setItem("hackuniverse.intro.v1.seen", "1");
      localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({ schemaVersion: 1, musicEnabled: false, effectsEnabled: true, musicVolume: 0.35, effectsVolume: 0.5 }));
      const original = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (this: AudioNode, destination: AudioNode | AudioParam, ...ports: number[]) {
        const host = window as unknown as CaptureWindow;
        if (!host.cameraCapture && destination instanceof AudioDestinationNode && this.context instanceof AudioContext) {
          host.cameraCapture = { context: this.context, source: this, samples: [], voices: [], wheels: [], startedAt: 0, blockNextOrbit: false, blocked: null };
        }
        return Reflect.apply(original, this, [destination, ...ports]);
      } as AudioNode["connect"];
      const wheelPackets = new WeakMap<WheelEvent, { packet: CameraWheel; voicesBefore: number }>();
      document.addEventListener("wheel", (event) => {
        const capture = (window as unknown as CaptureWindow).cameraCapture;
        if (!capture || !event.isTrusted) return;
        wheelPackets.set(event, {
          packet: { direction: event.deltaY < 0 ? "in" : "out", age: performance.now() - event.timeStamp, handledAge: 0, trusted: event.isTrusted, voiceIndexes: [] },
          voicesBefore: capture.voices.length,
        });
      }, true);
      document.addEventListener("wheel", (event) => {
        const capture = (window as unknown as CaptureWindow).cameraCapture;
        const delivery = wheelPackets.get(event);
        if (!capture || !delivery) return;
        delivery.packet.handledAge = performance.now() - event.timeStamp;
        delivery.packet.voiceIndexes = capture.voices.flatMap((voice, index) => index >= delivery.voicesBefore && voice.duration > 5 ? [index] : []);
        capture.wheels.push(delivery.packet);
      });
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
    const zoomWheels: number[] = [];
    if (motion === "orbit") {
      // Reproduce a driver gap: setup-relative PCM windows must not pass.
      await page.waitForTimeout(250);
      await page.mouse.down();
      await page.mouse.move(point.x + 48, point.y + 16);
    } else {
      for (const [direction, delta] of [["out", 100], ["in", -100]] as const) {
        let accepted: number | null = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          const before = await page.evaluate(() => (window as unknown as CaptureWindow).cameraCapture!.wheels.length);
          await page.mouse.wheel(0, delta);
          const acknowledgement = await page.waitForFunction((before) => {
            const wheels = (window as unknown as CaptureWindow).cameraCapture!.wheels;
            return wheels.length > before ? { index: before, packet: wheels[before] } : null;
          }, before);
          const delivery = await acknowledgement.jsonValue();
          if (!delivery) throw new Error("Trusted wheel acknowledgement is missing");
          await testInfo.attach(`zoom-${direction}-packet-${attempt + 1}`, { body: JSON.stringify(delivery, null, 2), contentType: "application/json" });
          expect(delivery.packet.trusted).toBe(true);
          expect(delivery.packet.direction).toBe(direction);
          if (delivery.packet.voiceIndexes.length > 0) { accepted = delivery.index; break; }
          // Reissue only packets already stale at document capture. A fresh
          // trusted gesture without its real native source is an application failure.
          expect(delivery.packet.age, `${direction} wheel did not create its native source`).toBeGreaterThan(180);
        }
        expect(accepted, `${direction} did not receive a fresh native source`).not.toBeNull();
        zoomWheels.push(accepted!);
        if (direction === "out") await page.waitForFunction((index) => {
          const capture = (window as unknown as CaptureWindow).cameraCapture!;
          const lastStop = Math.max(...capture.wheels[index].voiceIndexes.map((voice) => capture.voices[voice].stopAt ?? Infinity));
          return capture.samples.some((sample) => sample.at >= lastStop + 0.36);
        }, accepted!);
      }
    }
    if (motion === "orbit") await page.mouse.up();
    else {
      await page.evaluate(() => {
        const blockedUntil = performance.now() + 700;
        while (performance.now() < blockedUntil) { /* Deliberately block timers. */ }
      });
    }
    await page.waitForTimeout(50);
    const measured = await page.evaluate(({ motion, zoomWheels }) => {
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
        wheels: capture.wheels,
        directions: zoomWheels.map((index) => {
          const wheel = capture.wheels[index];
          const sources = wheel.voiceIndexes.map((voice) => capture.voices[voice]);
          const start = sources[0].at;
          const stop = Math.max(...sources.map((source) => source.stopAt ?? Infinity));
          return { direction: wheel.direction, sources, active: rms(start + 0.04, start + 0.12), tail: rms(stop + 0.16, stop + 0.36) };
        }),
      };
    }, { motion, zoomWheels });
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
      expect(measured.directions.map((measurement) => measurement.direction)).toEqual(["out", "in"]);
      for (const direction of measured.directions) {
        expect(direction.sources.length).toBeGreaterThan(0);
        expect(direction.active.count).toBeGreaterThan(0);
        expect(direction.tail.count).toBeGreaterThan(0);
        expect(direction.active.level).toBeLessThan(0.00001);
        expect(direction.tail.level).toBeLessThan(0.00001);
      }
    }
  });
}
