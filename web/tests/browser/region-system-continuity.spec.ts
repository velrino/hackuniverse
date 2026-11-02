import { expect, test } from "@playwright/test";
import * as THREE from "three";
import authoring from "../../src/modules/universe/data/demo-universe.json";
import { normalizeDemoCatalog } from "../../src/modules/universe/adapters/catalog/demo";
import { parseUniverseCatalog } from "../../src/modules/universe/domain";
import { getSceneView } from "../../src/modules/universe/domain/catalog";
import { mapSceneViews } from "../../src/modules/universe/scene/view-coordinates";

const catalog = parseUniverseCatalog(normalizeDemoCatalog(authoring));
const region = getSceneView(catalog, "cloud-local-interstellar");
const system = getSceneView(catalog, "system-gj-674");
const inward = mapSceneViews(region, system)!;
const center = inward.offset.clone().multiplyScalar(-1 / inward.scale);
const position = center.clone().add(new THREE.Vector3(0.16, 0.5, 0.85).normalize().multiplyScalar(45));

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test.describe(`regional system continuity (${reducedMotion})`, () => {
    test.use({ reducedMotion });
    test("wheel entry preserves camera scale, nearby planets and the reverse regional view", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("hackuniverse.intro.v1.seen", "1");
        localStorage.setItem("hackuniverse.demo-tour.v1.seen", "1");
        localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({ schemaVersion: 1, muted: true, musicEnabled: false, effectsEnabled: false, musicVolume: 0.35, effectsVolume: 0.5 }));
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const query = new URLSearchParams({ lang: "en", source: "demo", scale: "proportional", target: "cloud-local-interstellar", camera: [...position.toArray(), ...center.toArray()].join(",") });
      await page.goto(`/?${query}`);
      await expect(page.locator('.universe-scene[aria-busy]')).toHaveAttribute("aria-busy", "false");
      const canvas = await page.locator("canvas").elementHandle();
      const star = page.locator('button.universe-node-label[data-destination-id="system-gj-674"]');
      await expect(star).toBeVisible();
      // The label forwards a trusted wheel gesture to the same optical dolly.
      await star.hover();
      await page.mouse.wheel(0, -20);
      await expect.poll(() => new URL(page.url()).searchParams.get("target")).toBe("system-gj-674");
      const cameraPose = new URL(page.url()).searchParams.get("camera")!.split(",").map(Number);
      const distance = new THREE.Vector3(...cameraPose.slice(0, 3)).distanceTo(new THREE.Vector3(...cameraPose.slice(3)));
      // Entry can advance the requested zoom, but must never refit outward.
      expect(distance).toBeLessThanOrEqual(45 * inward.scale * 1.01);
      expect(distance).toBeGreaterThan(45 * inward.scale * 0.75);
      expect(Math.hypot(...cameraPose.slice(3))).toBeLessThan(0.1);
      await expect(page.locator('button.universe-node-label[data-destination-id="planet-gj-674-b"]')).toBeVisible();
      await expect.poll(() => page.locator('button[data-preview="true"][data-destination-kind="planet"]:visible').count()).toBeGreaterThan(0);
      expect(await page.locator("canvas").evaluate((node, original) => node === original, canvas)).toBe(true);
      await page.getByRole("button", { name: "Region", exact: true }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get("target")).toBe("cloud-local-interstellar");
      await expect(star).toBeVisible();
      const returned = new URL(page.url()).searchParams.get("camera")!.split(",").map(Number);
      expect(new THREE.Vector3(...returned.slice(3)).distanceTo(center)).toBeLessThan(0.1);
      expect(errors).toEqual([]);
    });
  });
}
