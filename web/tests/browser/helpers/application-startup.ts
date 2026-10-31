import type { CDPSession, Page } from "@playwright/test";

export type StartupState = {
  phase: string | null;
  phases: string[];
  sceneBusy: boolean;
  canvasCount: number;
  indeterminate: boolean;
  progress: string | null;
  entryCount: number;
  activated: boolean;
  menuOpen: { phase: string | null }[];
};

export async function observeStartup(page: Page, holdFirstFrame = false) {
  await page.addInitScript((holdFirstFrame) => {
    localStorage.setItem("hackuniverse.demo-tour.v1.seen", "1");
    const probe = { phases: [] as string[], voices: [] as { duration: number; phase: string | null }[], releaseFrames: () => {} };
    Object.assign(window, { startupProbe: probe });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
      if (this.buffer) probe.voices.push({ duration: this.buffer.duration, phase: document.querySelector("[data-application-intro]")?.getAttribute("data-application-intro") ?? null });
      return start.call(this, when, offset, duration);
    };
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
    // Scene resources mount, but readiness still requires its actual first frame.
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

export async function readStartup(cdp: CDPSession): Promise<StartupState> {
  const result = await cdp.send("Runtime.evaluate", {
    userGesture: false,
    returnByValue: true,
    expression: `(() => {
      const progress = document.querySelector('.vui-full-screen-loader [role="progressbar"]');
      return {
        phase: document.querySelector('[data-application-intro]')?.getAttribute('data-application-intro') ?? null,
        phases: window.startupProbe.phases,
        sceneBusy: document.querySelector('.universe-scene[aria-busy]')?.getAttribute('aria-busy') === 'true',
        canvasCount: document.querySelectorAll('canvas').length,
        indeterminate: progress?.getAttribute('data-indeterminate') === 'true',
        progress: progress?.getAttribute('aria-valuenow') ?? null,
        entryCount: document.querySelectorAll('.application-intro-entry, .universe-tour-entry').length,
        activated: navigator.userActivation.hasBeenActive,
        menuOpen: window.startupProbe.voices.filter(voice => voice.duration > 1.4 && voice.duration < 1.7).map(voice => ({phase: voice.phase}))
      };
    })()`,
  });
  if (result.exceptionDetails) throw new Error("Unable to observe startup without granting activation");
  return result.result.value as StartupState;
}
