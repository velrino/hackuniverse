import { expect, test, type BrowserContext, type ElementHandle, type Page } from "@playwright/test";
import * as THREE from "three";
import authoring from "../../src/modules/universe/data/demo-universe.json";
import { normalizeDemoCatalog } from "../../src/modules/universe/adapters/catalog/demo";
import { parseUniverseCatalog } from "../../src/modules/universe/domain";
import { getSceneView } from "../../src/modules/universe/domain/catalog";
import { readCameraLink } from "../../src/modules/universe/domain/camera-link";
import type { SceneNode } from "../../src/modules/universe/domain/types";
import { clusterPosition, clusterScale, orbitalAngle, previewScale, systemOrbit } from "../../src/modules/universe/scene/layout";
import { createSurroundingContext } from "../../src/modules/universe/scene/surrounding-context";

const catalog = parseUniverseCatalog(normalizeDemoCatalog(authoring));
const solar = getSceneView(catalog, "system-solar").anchor!;
const neighborhood = getSceneView(catalog, "cloud-local-interstellar").anchor!;
const milkyWay = getSceneView(catalog, "galaxy-milky-way").anchor!;
type Pose = { position: THREE.Vector3; target: THREE.Vector3 };

async function prepare(context: BrowserContext, page: Page) {
  await context.addInitScript(() => {
    localStorage.setItem("hackuniverse.intro.v1.seen", "1");
    localStorage.setItem("hackuniverse.demo-tour.v1.seen", "1");
    localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({ schemaVersion: 1, muted: true, musicEnabled: false, effectsEnabled: false, musicVolume: 0.35, effectsVolume: 0.5 }));
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

function neighborhoodContext(anchorId: string, kind: "system" | "galaxy", mobile: boolean) {
  const textures = [new THREE.Texture(), new THREE.Texture(), new THREE.Texture()];
  const context = createSurroundingContext(getSceneView(catalog, anchorId), {
    glowMap: textures[0], coronaMap: textures[1], galaxyPointMap: textures[2], pixelRatio: 1,
  }, { mobile, elapsed: 0 });
  const destination = context.labels.find((candidate) => candidate.kind === kind);
  if (!destination) throw new Error(`No named ${kind} context around ${anchorId}`);
  const result = { id: destination.id, name: destination.name, position: destination.position.clone() };
  context.root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Sprite) {
      if (!(object instanceof THREE.Sprite)) object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    }
  });
  textures.forEach((texture) => texture.dispose());
  return result;
}

function framing(target: THREE.Vector3, topDown = false): Pose {
  return { target: target.clone(), position: target.clone().add(topDown ? new THREE.Vector3(0, 35, 0.01) : new THREE.Vector3(0, 45, 80)) };
}

async function openView(page: Page, id: string, pose: Pose) {
  const query = new URLSearchParams({ lang: "en", source: "demo", target: id, camera: [...pose.position.toArray(), ...pose.target.toArray()].join(","), check: "visible-destinations" });
  await page.goto(`/?${query}#direct-navigation`);
  await expect(page.locator('.universe-scene[aria-busy]')).toHaveAttribute("aria-busy", "false");
  const canvas = await page.locator("canvas").elementHandle();
  expect(canvas).not.toBeNull();
  return canvas!;
}

async function expectDestination(page: Page, canvas: ElementHandle, id: string, kind: string, name: string) {
  await expect(page.locator("main")).toHaveAttribute("data-scale", kind);
  await expect(page.locator(".universe-context h1")).toHaveText(name);
  await expect(page).toHaveURL((url) => {
    const location = readCameraLink(url.search);
    return location.kind === "valid" && location.targetId === id && location.source === "demo" &&
      url.searchParams.get("lang") === "en" && url.searchParams.get("check") === "visible-destinations" && url.hash === "#direct-navigation";
  });
  expect(await canvas.evaluate((element) => element.isConnected)).toBe(true);
  await expect(page.locator("canvas")).toHaveCount(1);
}

async function clickRenderedPoint(page: Page, pose: Pose, point: THREE.Vector3, mobile: boolean) {
  const box = await page.locator("canvas").boundingBox();
  expect(box).not.toBeNull();
  const camera = new THREE.PerspectiveCamera(46, box!.width / box!.height, 0.1, 10_000_000);
  camera.position.copy(pose.position);
  camera.lookAt(pose.target);
  camera.updateMatrixWorld();
  const projected = point.clone().project(camera);
  const x = box!.x + (projected.x + 1) * box!.width / 2;
  // Captions end above their destinations. Select the visible graphic below the
  // caption boundary, exercising canvas picking rather than a label click.
  const y = box!.y + (1 - projected.y) * box!.height / 2 + 3;
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y) instanceof HTMLCanvasElement, { x, y })).toBe(true);
  if (mobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

function groupPosition(parent: SceneNode, child: SceneNode) {
  const children = parent.children ?? [];
  return new THREE.Vector3(...clusterPosition(child, children.findIndex(({ id }) => id === child.id), children.length, clusterScale(children).radius));
}

test("a visible neighboring system marker navigates directly from another system", async ({ page, context }, testInfo) => {
  const errors = await prepare(context, page);
  const mobile = testInfo.project.name === "mobile";
  const neighbor = neighborhoodContext(solar.id, "system", mobile);
  const pose = framing(neighbor.position);
  const canvas = await openView(page, solar.id, pose);
  const caption = page.locator(`button.universe-context-label[data-destination-id="${neighbor.id}"]`);
  await expect(caption).toBeVisible();
  await expect(caption).toHaveAttribute("data-destination-kind", "system");
  await clickRenderedPoint(page, pose, neighbor.position, mobile);
  await expectDestination(page, canvas, neighbor.id, "system", neighbor.name);
  expect(errors).toEqual([]);
  await canvas.dispose();
});

test("a visible surrounding galaxy caption is a keyboard destination", async ({ page, context }, testInfo) => {
  const errors = await prepare(context, page);
  const galaxy = neighborhoodContext(milkyWay.id, "galaxy", testInfo.project.name === "mobile");
  const canvas = await openView(page, milkyWay.id, framing(galaxy.position));
  const caption = page.locator(`button.universe-context-label[data-destination-id="${galaxy.id}"]`);
  await expect(caption).toBeVisible();
  await expect(caption).toHaveAttribute("data-destination-kind", "galaxy");
  await caption.focus();
  await expect(caption).toBeFocused();
  await page.keyboard.press("Enter");
  await expectDestination(page, canvas, galaxy.id, "galaxy", galaxy.name);
  expect(errors).toEqual([]);
  await canvas.dispose();
});

test("a visible miniature planet opens its full system and planet details directly", async ({ page, context }, testInfo) => {
  const errors = await prepare(context, page);
  const center = groupPosition(neighborhood, solar);
  const pose = framing(center, true);
  const canvas = await openView(page, neighborhood.id, pose);
  const solarIds = solar.children!.map(({ id }) => id);
  const previews = page.locator('button.universe-node-label[data-preview="true"][data-destination-kind="planet"]:visible');
  await expect.poll(async () => previews.evaluateAll((elements, ids) => elements.some((element) => ids.includes(element.getAttribute("data-destination-id") ?? "")), solarIds)).toBe(true);
  const id = await previews.evaluateAll((elements, ids) => elements.map((element) => element.getAttribute("data-destination-id")).find((id) => id !== null && ids.includes(id)), solarIds);
  const planetIndex = solar.children!.findIndex((planet) => planet.id === id);
  expect(planetIndex).toBeGreaterThanOrEqual(0);
  const planet = solar.children![planetIndex];
  const scale = previewScale(solar, clusterScale(neighborhood.children!).marker);
  const angle = orbitalAngle(planetIndex, 0);
  const position = center.clone().add(new THREE.Vector3(Math.cos(angle) * systemOrbit(planetIndex) * scale, 0, Math.sin(angle) * systemOrbit(planetIndex) * scale));
  await clickRenderedPoint(page, pose, position, testInfo.project.name === "mobile");
  await expectDestination(page, canvas, planet.id, "planet", planet.name);
  await expect(page.getByRole("region", { name: planet.name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to system", exact: true }).click();
  await expect(page.locator(".universe-context h1")).toHaveText(solar.name);
  expect(errors).toEqual([]);
  await canvas.dispose();
});

test("a system point inside a galaxy's region preview is directly selectable", async ({ page, context }, testInfo) => {
  const errors = await prepare(context, page);
  const cloudCenter = groupPosition(milkyWay, neighborhood);
  const systems = neighborhood.children!;
  const solarIndex = systems.findIndex(({ id }) => id === solar.id);
  const cloudExtent = clusterScale(milkyWay.children!).marker;
  const position = cloudCenter.add(new THREE.Vector3(...clusterPosition(solar, solarIndex, systems.length, cloudExtent * 1.1)));
  const pose = framing(position, true);
  const canvas = await openView(page, milkyWay.id, pose);
  const preview = page.locator(`button.universe-node-label[data-preview="true"][data-destination-id="${solar.id}"]`);
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("data-destination-kind", "system");
  await clickRenderedPoint(page, pose, position, testInfo.project.name === "mobile");
  await expectDestination(page, canvas, solar.id, "system", solar.name);
  expect(errors).toEqual([]);
  await canvas.dispose();
});

test.describe("normal motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("a neighboring system transition settles its camera and shared URL", async ({ page, context }, testInfo) => {
    const errors = await prepare(context, page);
    const mobile = testInfo.project.name === "mobile";
    const neighbor = neighborhoodContext(solar.id, "system", mobile);
    const pose = framing(neighbor.position);
    const canvas = await openView(page, solar.id, pose);
    await expect(page.locator(`button.universe-context-label[data-destination-id="${neighbor.id}"]`)).toBeVisible();
    await clickRenderedPoint(page, pose, neighbor.position, mobile);
    await expectDestination(page, canvas, neighbor.id, "system", neighbor.name);
    expect(errors).toEqual([]);
    await canvas.dispose();
  });
});
