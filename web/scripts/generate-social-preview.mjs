#!/usr/bin/env node
/** Rebuild the static social cover: node scripts/generate-social-preview.mjs */
import assert from "node:assert/strict";
import { mkdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const width = 1200;
const height = 630;
const output = new URL("../public/brand/social-preview.png", import.meta.url);
const logo = await readFile(new URL("../../assets/images/logo.png", import.meta.url));
const regular = await readFile(new URL("../src/styles/fonts/barlow-400.woff2", import.meta.url));
const bold = await readFile(new URL("../src/styles/fonts/barlow-800.woff2", import.meta.url));
const data = (bytes, type) => `data:${type};base64,${bytes.toString("base64")}`;

// Seeded decoration keeps this asset independent of the live catalog and network.
let seed = 6083;
const random = () => {
  seed = Math.imul(seed, 1664525) + 1013904223 | 0;
  return (seed >>> 0) / 4294967296;
};
const stars = Array.from({ length: 140 }, () => {
  const x = Math.round(random() * width);
  const y = Math.round(random() * height);
  const radius = (random() * 0.9 + 0.35).toFixed(2);
  const opacity = (random() * 0.5 + 0.15).toFixed(2);
  return `<circle cx="${x}" cy="${y}" r="${radius}" opacity="${opacity}"/>`;
}).join("");
const meridians = [-0.8, -0.5, 0, 0.5, 0.8].map((position) => {
  const control = (position * 300).toFixed(1);
  return `<path d="M 0 -175 C ${control} -110 ${control} 110 0 175"/>`;
}).join("");
const latitudes = [-0.65, -0.35, 0, 0.35, 0.65].map((position) => {
  const y = position * 175;
  const radius = Math.sqrt(175 ** 2 - y ** 2);
  return `<ellipse cx="0" cy="${y.toFixed(1)}" rx="${radius.toFixed(1)}" ry="${(radius * 0.13).toFixed(1)}"/>`;
}).join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
@font-face { font-family: Barlow; font-weight: 400; src: url('${data(regular, "font/woff2")}') format('woff2'); }
@font-face { font-family: Barlow; font-weight: 800; src: url('${data(bold, "font/woff2")}') format('woff2'); }
* { box-sizing: border-box; }
html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
body { background: #020a10; color: #e5fbff; font-family: Barlow, sans-serif; }
.cover { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; background: radial-gradient(ellipse at 84% 49%, #0b2937 0%, #05151f 36%, #020a10 73%); }
.art { position: absolute; inset: 0; }
.logo { position: absolute; top: 61px; left: 62px; width: 112px; height: 112px; object-fit: contain; }
.copy { position: absolute; left: 76px; top: 236px; z-index: 1; }
h1 { margin: 0; font-size: 92px; font-weight: 800; line-height: 1.06; letter-spacing: -3.5px; }
h1 span { color: #42e8f4; }
.domain { margin: 26px 0 0 3px; font-size: 29px; font-weight: 400; letter-spacing: 1px; color: #b3d7e1; }
</style></head><body><main class="cover">
<svg class="art" width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="halo"><stop stop-color="#42e8f4" stop-opacity=".14"/><stop offset="1" stop-color="#42e8f4" stop-opacity="0"/></radialGradient>
    <radialGradient id="surface" cx="28%" cy="24%" r="81%"><stop stop-color="#148397"/><stop offset=".35" stop-color="#075064"/><stop offset=".76" stop-color="#052330"/><stop offset="1" stop-color="#020b12"/></radialGradient>
    <radialGradient id="shade" cx="80%" cy="65%" r="82%"><stop offset=".1" stop-color="#01090f" stop-opacity=".85"/><stop offset=".63" stop-color="#01090f" stop-opacity=".36"/><stop offset="1" stop-color="#01090f" stop-opacity="0"/></radialGradient>
    <linearGradient id="rim" x1="-120" y1="-160" x2="160" y2="140" gradientUnits="userSpaceOnUse"><stop stop-color="#a4fcff"/><stop offset=".38" stop-color="#42e8f4" stop-opacity=".7"/><stop offset="1" stop-color="#42e8f4" stop-opacity=".06"/></linearGradient>
    <linearGradient id="orbit" x1="-310" y1="0" x2="310" y2="0" gradientUnits="userSpaceOnUse"><stop stop-color="#42e8f4" stop-opacity="0"/><stop offset=".35" stop-color="#42e8f4" stop-opacity=".45"/><stop offset=".7" stop-color="#a4fcff" stop-opacity=".7"/><stop offset="1" stop-color="#42e8f4" stop-opacity=".1"/></linearGradient>
    <clipPath id="globe"><circle r="175"/></clipPath>
  </defs>
  <g fill="#b8edf6">${stars}</g>
  <circle cx="962" cy="320" r="340" fill="url(#halo)"/>
  <g stroke="#42e8f4" stroke-opacity=".045" stroke-width="1">
    <path d="M 600 630 L 820 0 M 720 630 L 880 0 M 840 630 L 940 0 M 960 630 L 1000 0 M 1080 630 L 1060 0 M 1200 630 L 1120 0"/>
    <path d="M 560 500 H 1200 M 600 560 H 1200 M 650 620 H 1200"/>
  </g>
  <g transform="translate(962 320) rotate(-26)">
    <ellipse rx="299" ry="80" stroke="#42e8f4" stroke-opacity=".2"/>
    <ellipse rx="323" ry="97" stroke="#42e8f4" stroke-opacity=".09"/>
    <ellipse rx="299" ry="80" stroke="#42e8f4" stroke-opacity=".65" stroke-dasharray="4 975 40 1000"/>
  </g>
  <g transform="translate(962 320)">
    <circle r="175" fill="url(#surface)"/>
    <g clip-path="url(#globe)" transform="rotate(-17)">
      <g stroke="#75dce5" stroke-opacity=".19" stroke-width=".75">${latitudes}${meridians}</g>
      <path d="M -168 -30 C -120 -100 -70 -80 -30 -125 S 80 -82 170 -105 M -177 35 C -98 -14 -58 35 0 -24 S 95 28 178 -29 M -155 95 C -90 35 -25 100 30 47 S 100 86 172 39" stroke="#70d6d6" stroke-opacity=".12" stroke-width="24"/>
    </g>
    <circle r="175" fill="url(#shade)"/>
    <circle r="175" stroke="url(#rim)" stroke-width="1.8"/>
    <path d="M -155 -83 A 176 176 0 0 1 -40 -171" stroke="#c0ffff" stroke-opacity=".65" stroke-width="2.5"/>
  </g>
  <g transform="translate(962 320) rotate(-26)">
    <path d="M -299 0 A 299 80 0 0 0 299 0" stroke="url(#orbit)" stroke-width="1.6"/>
    <path d="M -309 0 A 309 87 0 0 0 309 0" stroke="url(#orbit)" stroke-opacity=".24" stroke-width="4"/>
    <circle cx="-258" cy="40" r="5" fill="#42e8f4"/>
    <circle cx="-258" cy="40" r="11" stroke="#42e8f4" stroke-opacity=".28"/>
    <circle cx="245" cy="46" r="3" fill="#c0ffff"/>
  </g>
  <g stroke="#42e8f4" stroke-opacity=".38" stroke-width="1">
    <path d="M 34 75 V 49 L 49 34 H 104 M 1096 34 H 1151 L 1166 49 V 75 M 34 555 V 581 L 49 596 H 104 M 1096 596 H 1151 L 1166 581 V 555"/>
    <path d="M 78 496 H 188"/><path d="M 198 496 H 228" stroke-opacity=".3"/>
  </g>
  <circle cx="238" cy="496" r="2" fill="#42e8f4" fill-opacity=".75"/>
</svg>
<img class="logo" src="${data(logo, "image/png")}" alt=""/>
<div class="copy"><h1>Hack<span>Universe</span></h1><p class="domain">universe.velrino.co</p></div>
</main></body></html>`;

await mkdir(dirname(fileURLToPath(output)), { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
  });
  const title = await page.locator("h1").boundingBox();
  assert.ok(title && title.x + title.width < 755, "The brand must fit before the planetary illustration");
  await page.screenshot({ path: fileURLToPath(output), type: "png" });
  const preview = join(tmpdir(), "hackuniverse-social-preview-600.png");
  await page.setViewportSize({ width: 600, height: 315 });
  await page.evaluate(() => { document.querySelector(".cover").style.transformOrigin = "top left"; document.querySelector(".cover").style.transform = "scale(.5)"; });
  await page.screenshot({ path: preview, type: "png" });
  const bytes = (await stat(output)).size;
  assert.ok(bytes < 500_000, "Keep the static social cover below 500 KB");
  console.log(JSON.stringify({ output: "web/public/brand/social-preview.png", width, height, bytes, preview }));
} finally {
  await browser.close();
}
