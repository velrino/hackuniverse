#!/usr/bin/env node
/** Standalone diagnostic: start a production server separately, then run
 * node scripts/measure-demo.mjs [baseURL] [artifactDir]. No server is started.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

if (process.argv.includes("--help")) {
  console.log("Usage: node scripts/measure-demo.mjs [http://127.0.0.1:3108] [artifactDir]\nRun against an already built/started production server, without competing builds or browser tests.");
  process.exit(0);
}
const baseURL = new URL(process.argv[2] ?? "http://127.0.0.1:3108");
assert.ok(["http:", "https:"].includes(baseURL.protocol), "baseURL must be HTTP(S)");
const artifactDir = resolve(process.argv[3] ?? join(tmpdir(), `hackuniverse-demo-${Date.now()}`));
const sourceText = await readFile(fileURLToPath(new URL("../src/modules/universe/data/demo-universe.json", import.meta.url)), "utf8");
const source = JSON.parse(sourceText);
const warmupMs = 1000;
const sampleMs = 2000;
const profiles = [
  { name: "desktop", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, cpuRate: 1, isMobile: false },
  { name: "constrained-mobile", viewport: { width: 360, height: 640 }, deviceScaleFactor: 1, cpuRate: 4, isMobile: true },
];

function catalogRecords(input) {
  if (Array.isArray(input.entities)) return { format: "legacy-flat", entities: input.entities };
  assert.ok(input.universe && input.catalog, "Expected an organized demo authoring document");
  const entities = [];
  const children = { universe: ["galaxies", "galaxy"], galaxy: ["clouds", "cloud"], cloud: ["systems", "system"], system: ["planets", "planet"] };
  function visit(node, kind, parentId) {
    entities.push({ id: node.id, name: node.name, kind, parentId });
    if (kind === "planet") return;
    const [field, childKind] = children[kind];
    assert.ok(Array.isArray(node[field]), `Missing ${kind}.${field}`);
    node[field].forEach((child) => visit(child, childKind, node.id));
  }
  visit(input.universe, "universe", null);
  return { format: "organized-demo", entities };
}
const catalog = catalogRecords(source);
const byId = new Map(catalog.entities.map((entity) => [entity.id, entity]));
assert.equal(byId.size, catalog.entities.length, "Catalog IDs must be unique");
const children = new Map();
for (const entity of catalog.entities) children.set(entity.parentId, [...(children.get(entity.parentId) ?? []), entity]);
const descendants = (entity) => entity.kind === "planet" ? [entity] : (children.get(entity.id) ?? []).flatMap(descendants);
const regions = catalog.entities.filter((entity) => entity.kind === "cloud");
const systems = catalog.entities.filter((entity) => entity.kind === "system");
const planets = catalog.entities.filter((entity) => entity.kind === "planet");
const largestRegion = regions.filter((region) => descendants(region).length).sort((a, b) => descendants(b).length - descendants(a).length)[0];
const richestSystem = systems.filter((system) => system.id !== "system-solar" && descendants(system).length).sort((a, b) => descendants(b).length - descendants(a).length)[0] ?? byId.get("system-solar");
assert.ok(largestRegion && richestSystem && byId.get("planet-earth"), "The demo needs Earth and populated regions/systems");
const bounds = [
  { name: "regions", actual: regions.length, maximum: 32 },
  { name: "systemsPerRegion", actual: Math.max(0, ...regions.map((region) => (children.get(region.id) ?? []).filter((child) => child.kind === "system").length)), maximum: 16 },
  { name: "planets", actual: planets.length, maximum: 1024 },
  { name: "exoplanetHosts", actual: systems.filter((system) => system.id !== "system-solar").length, maximum: 512 },
].map((bound) => ({ ...bound, passed: bound.actual <= bound.maximum }));

// Installed before application code. No renderer behavior or quality is changed.
function installProbe() {
  const counts = {};
  const draws = {};
  const frames = [];
  const seenContexts = new WeakSet();
  const wrapped = new WeakSet();
  const created = new Map();
  const state = { recording: false, startedAt: 0, contexts: 0, firstDrawAtMs: null, sceneReadyAtMs: null, contextLosses: 0, totalDraws: 0 };
  const observe = (context) => { if (!seenContexts.has(context)) { seenContexts.add(context); state.contexts++; } };
  for (const name of ["WebGLRenderingContext", "WebGL2RenderingContext"]) {
    const prototype = window[name]?.prototype;
    if (!prototype) continue;
    for (const method of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"]) {
      const native = prototype[method];
      if (typeof native !== "function" || wrapped.has(native)) continue;
      const wrapper = function (...args) {
        const result = native.apply(this, args);
        observe(this);
        draws[method] = (draws[method] ?? 0) + 1;
        state.totalDraws++;
        state.firstDrawAtMs ??= performance.now();
        return result;
      };
      wrapped.add(wrapper);
      prototype[method] = wrapper;
    }
    for (const type of ["Buffer", "Texture", "Program", "Shader", "Framebuffer", "Renderbuffer", "VertexArray", "Query", "Sampler", "TransformFeedback"]) {
      counts[type] ??= { created: 0, deleted: 0, live: 0 };
      if (!created.has(type)) created.set(type, new WeakSet());
      for (const action of ["create", "delete"]) {
        const method = `${action}${type}`;
        const native = prototype[method];
        if (typeof native !== "function" || wrapped.has(native)) continue;
        const wrapper = function (...args) {
          const result = native.apply(this, args);
          observe(this);
          if (action === "create" && result) {
            created.get(type).add(result); counts[type].created++; counts[type].live++;
          } else if (action === "delete" && args[0] && created.get(type).delete(args[0])) {
            counts[type].deleted++; counts[type].live--;
          }
          return result;
        };
        wrapped.add(wrapper);
        prototype[method] = wrapper;
      }
    }
  }
  const nativeRAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => nativeRAF((timestamp) => {
    const start = performance.now();
    const before = state.totalDraws;
    try { callback(timestamp); }
    finally {
      const end = performance.now();
      const calls = state.totalDraws - before;
      if (state.recording && calls && frames.length < 10000) frames.push({ atMs: start, timestampMs: timestamp, callbackWallMs: end - start, drawCalls: calls });
    }
  });
  const ready = () => {
    if (state.sceneReadyAtMs === null && document.querySelector('.universe-scene[aria-busy="false"] canvas')) state.sceneReadyAtMs = performance.now();
  };
  new MutationObserver(ready).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-busy"] });
  document.addEventListener("webglcontextlost", () => { state.contextLosses++; }, true);
  const snapshot = () => ({ ...state, resources: structuredClone(counts), drawMethods: { ...draws }, heap: performance.memory ? { usedBytes: performance.memory.usedJSHeapSize, totalBytes: performance.memory.totalJSHeapSize, limitBytes: performance.memory.jsHeapSizeLimit } : null });
  window.demoMeasure = {
    snapshot,
    begin() { frames.length = 0; state.startedAt = performance.now(); state.recording = true; return snapshot(); },
    finish() { state.recording = false; return { ...snapshot(), elapsedMs: performance.now() - state.startedAt, frames: [...frames] }; },
  };
}

const round = (number) => Number.isFinite(number) ? Number(number.toFixed(3)) : null;
function stats(values) {
  if (!values.length) return { count: 0, mean: null, p50: null, p95: null, maximum: null };
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, mean: round(values.reduce((sum, value) => sum + value, 0) / values.length), p50: round(sorted[Math.floor((sorted.length - 1) * 0.5)]), p95: round(sorted[Math.floor((sorted.length - 1) * 0.95)]), maximum: round(sorted.at(-1)) };
}
async function arrival(page, entity, requireCamera = true) {
  await page.waitForFunction(({ id, name, kind, requireCamera }) => {
    const main = document.querySelector("main.universe-page");
    return main?.getAttribute("data-scale") === kind && document.querySelector(".universe-context h1")?.textContent === name && (!requireCamera || new URL(location.href).searchParams.get("target") === id);
  }, { ...entity, requireCamera }, { timeout: 30000 });
}
async function wider(page, entity) {
  await page.locator("button.universe-scale-back").click();
  await arrival(page, entity);
}
async function viaAtlas(page, planet) {
  await page.getByRole("button", { name: "Explorer menu", exact: true }).click();
  const menu = page.locator('.universe-explorer-menu[role="dialog"]');
  await menu.getByRole("tab", { name: "Go to", exact: true }).click();
  await menu.getByRole("textbox", { name: "Search planets", exact: true }).fill(planet.name);
  await menu.locator(".universe-menu-planets button").filter({ has: page.getByText(planet.name, { exact: true }) }).click();
  await arrival(page, planet);
}
async function sample(page, cdp, entity, label) {
  await page.waitForTimeout(warmupMs);
  const before = await page.evaluate(() => window.demoMeasure.begin());
  await page.waitForTimeout(sampleMs);
  const after = await page.evaluate(() => window.demoMeasure.finish());
  assert.ok(after.frames.length > 0, `${label}: no RAF callback issued actual WebGL draws`);
  assert.equal(after.contextLosses, 0, `${label}: WebGL context was lost`);
  const intervals = after.frames.slice(1).map((frame, index) => frame.timestampMs - after.frames[index].timestampMs).filter((value) => value > 0);
  const intervalStats = stats(intervals);
  const metrics = await cdp.send("Performance.getMetrics").catch(() => ({ metrics: [] }));
  const heap = metrics.metrics.find((metric) => metric.name === "JSHeapUsedSize")?.value ?? after.heap?.usedBytes ?? null;
  return {
    label, target: { id: entity.id, name: entity.name, kind: entity.kind }, descendantPlanets: descendants(entity).length,
    observed: await page.locator("main.universe-page").getAttribute("data-scale"), elapsedMs: round(after.elapsedMs), renderedCallbacks: after.frames.length,
    callbackWallMs: stats(after.frames.map((frame) => frame.callbackWallMs)), renderedCallbackIntervalMs: intervalStats,
    renderedCallbackCadenceHz: intervalStats.mean ? round(1000 / intervalStats.mean) : null,
    drawCallsPerRenderedCallback: stats(after.frames.map((frame) => frame.drawCalls)), drawCallsDuringSample: after.totalDraws - before.totalDraws,
    drawMethodsDuringSample: Object.fromEntries(Object.entries(after.drawMethods).map(([method, count]) => [method, count - (before.drawMethods[method] ?? 0)])),
    heapUsedBytes: heap, resourcesBefore: before.resources, resourcesAfter: after.resources,
  };
}
async function runProfile(browser, profile) {
  const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, isMobile: profile.isMobile, hasTouch: profile.isMobile, locale: "en-US", reducedMotion: "no-preference" });
  const budget = setTimeout(() => { void context.close(); }, 180000);
  const errors = [];
  const result = { ...profile, views: [], pageErrors: errors };
  try {
    await context.addInitScript(() => {
      localStorage.setItem("hackuniverse.intro.v1.seen", "1");
      localStorage.setItem("hackuniverse.demo-tour.v1.seen", "1");
      localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({ schemaVersion: 1, musicEnabled: false, effectsEnabled: false, musicVolume: 0.35, effectsVolume: 0.5 }));
    });
    await context.addInitScript(installProbe);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on("pageerror", (error) => errors.push(error.message.slice(0, 500)));
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuRate });
    await cdp.send("Performance.enable");
    const url = new URL("/?lang=en&source=demo", baseURL);
    const response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45000 });
    assert.equal(response?.status(), 200, "The production page must return HTTP 200");
    await page.waitForFunction(() => window.demoMeasure.snapshot().sceneReadyAtMs !== null, null, { timeout: 45000 });
    const graphics = await page.locator("canvas").evaluate((canvas) => {
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) return null;
      const extension = gl.getExtension("WEBGL_debug_renderer_info");
      return { renderer: gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), vendor: gl.getParameter(extension?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR), drawingBuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight } };
    });
    result.graphics = graphics;
    assert.ok(graphics && /swiftshader/i.test(graphics.renderer), "The diagnostic requires a verified SwiftShader renderer");
    const initial = await page.evaluate(() => window.demoMeasure.snapshot());
    result.firstDrawAtMs = round(initial.firstDrawAtMs);
    result.firstSceneReadyAtMs = round(initial.sceneReadyAtMs);
    result.initialHeapUsedBytes = initial.heap?.usedBytes ?? null;
    const views = result.views;
    let current = byId.get("planet-earth");
    await arrival(page, current, false);
    views.push(await sample(page, cdp, current, "Earth"));
    while (current.parentId) {
      current = byId.get(current.parentId);
      assert.ok(current, "A navigation parent is missing");
      await wider(page, current);
      views.push(await sample(page, cdp, current, `Earth hierarchy: ${current.kind}`));
    }
    await viaAtlas(page, descendants(largestRegion)[0]);
    await wider(page, byId.get(descendants(largestRegion)[0].parentId));
    await wider(page, largestRegion);
    views.push(await sample(page, cdp, largestRegion, "Largest populated region"));
    if (profile.isMobile) await page.screenshot({ path: join(artifactDir, "mobile-largest-region.png") });
    await viaAtlas(page, descendants(richestSystem)[0]);
    await wider(page, richestSystem);
    views.push(await sample(page, cdp, richestSystem, "Richest non-Solar system"));
    assert.deepEqual(errors, [], `${profile.name}: page errors occurred`);
    const final = await page.evaluate(() => window.demoMeasure.snapshot());
    return { ...result, finalResources: final.resources, finalDrawMethods: final.drawMethods };
  } catch (error) {
    error.profile = result;
    throw error;
  } finally { clearTimeout(budget); await context.close(); }
}

const report = {
  generatedAt: new Date().toISOString(), baseURL: baseURL.origin, sourceFormat: catalog.format,
  sourceSha256: createHash("sha256").update(sourceText).digest("hex"), runtime: { node: process.version, platform: process.platform, arch: process.arch },
  catalog: { entities: catalog.entities.length, galaxies: catalog.entities.filter((entity) => entity.kind === "galaxy").length, regions: regions.length, systems: systems.length, planets: planets.length, bounds },
  representatives: { largestRegion: { id: largestRegion.id, name: largestRegion.name, planets: descendants(largestRegion).length }, richestSystem: { id: richestSystem.id, name: richestSystem.name, planets: descendants(richestSystem).length } },
  warnings: catalog.format === "legacy-flat" ? ["Legacy flat source detected: regenerate the organized factual demo before interpreting constellation/exoplanet counts. The exoplanet-host bound counts non-Solar systems."] : [],
  method: { warmupMs, requestedSampleMs: sampleMs, profileBudgetMs: 180000, renderer: "headless Chromium SwiftShader", instrumentation: "Core WebGL/WebGL2 draw and create/delete calls, and only RAF callbacks issuing draws", timing: "RAF callback wall time includes synchronous JS and driver waits; it is not isolated CPU usage or GPU timing. Cadence is not physical-device FPS. Resource counts are API object counts, not GPU bytes; optional extensions are not instrumented." },
  profiles: [],
};
await mkdir(artifactDir, { recursive: true });
let browser;
try {
  assert.ok(bounds.every((bound) => bound.passed), "The catalog exceeds the declared demo bounds");
  browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"] });
  report.browserVersion = browser.version();
  for (const profile of profiles) {
    console.log(`Measuring ${profile.name} (${profile.viewport.width}×${profile.viewport.height}, CPU ${profile.cpuRate}×)…`);
    report.profiles.push(await runProfile(browser, profile));
  }
} catch (error) {
  if (error.profile) report.profiles.push(error.profile);
  report.failure = error.message;
  process.exitCode = 1;
} finally { await browser?.close(); }
const table = ["| Profile / view | Draw callbacks | Callback mean / p95 ms | Interval p95 ms | Cadence Hz | Draws mean / max | Heap MiB |", "|---|---:|---:|---:|---:|---:|---:|"];
for (const profile of report.profiles) for (const view of profile.views) table.push(`| ${profile.name} / ${view.label} (${view.target.name}) | ${view.renderedCallbacks} | ${view.callbackWallMs.mean} / ${view.callbackWallMs.p95} | ${view.renderedCallbackIntervalMs.p95} | ${view.renderedCallbackCadenceHz ?? "n/a"} | ${view.drawCallsPerRenderedCallback.mean} / ${view.drawCallsPerRenderedCallback.maximum} | ${view.heapUsedBytes === null ? "n/a" : round(view.heapUsedBytes / 1048576)} |`);
const markdown = ["# Demo browser diagnostic", "", `Generated: ${report.generatedAt}`, "", "This is an instrumented software-browser diagnostic, not a physical-device FPS guarantee or an isolated CPU/GPU benchmark. No performance thresholds are invented or enforced.", "", ...report.warnings, "", `Catalog: ${report.catalog.entities} entities, ${report.catalog.systems} systems, ${report.catalog.planets} planets. Source: ${report.sourceFormat}.`, "", ...bounds.map((bound) => `- ${bound.name}: ${bound.actual} / ${bound.maximum} — ${bound.passed ? "within bound" : "EXCEEDED"}`), "", ...table, "", ...report.profiles.map((profile) => `- ${profile.name}: first scene ready ${profile.firstSceneReadyAtMs ?? "unavailable"} ms after navigation start; ${profile.pageErrors.length} page errors; ${profile.graphics?.renderer ?? "renderer unavailable"}.`), "", "Each view follows public navigation and a settled camera URL, then 1 second warmup and a requested 2 second sampling window. Actual window durations, per-view resources and raw draw methods are in measure-demo.json. Rendered callback intervals exclude RAF callbacks that did not draw. Heap usage is optional; resource counters count core API objects rather than GPU bytes.", ...(report.failure ? ["", `FAILED: ${report.failure}`] : []), ""].join("\n");
await writeFile(join(artifactDir, "measure-demo.json"), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(artifactDir, "measure-demo.md"), markdown);
console.log(markdown);
console.log(`Artifacts: ${artifactDir}`);
