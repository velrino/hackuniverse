import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import authoring from "../../src/modules/universe/data/demo-universe.json";
import { normalizeDemoCatalog } from "../../src/modules/universe/adapters/catalog/demo";
import { parseUniverseCatalog, type UniverseCatalogDocument } from "../../src/modules/universe/domain";
import { parseLocalWorkspace } from "../../src/modules/universe-workspace/domain";
import { serializeLocalWorkspace, workspaceStorageKey } from "../../src/modules/universe-workspace/adapters";

const demo = parseUniverseCatalog(normalizeDemoCatalog(authoring));
const earth = demo.planets.find(({ id }) => id === "planet-earth")!;
const trappist = demo.entities.find((entity) => entity.kind === "system" && entity.name === "TRAPPIST-1")!;
const trappistPlanets = demo.planets.filter(({ parentId }) => parentId === trappist.id);
const region = demo.entities.find(({ id }) => id === trappist.parentId)!;
const galaxy = demo.entities.find(({ id }) => id === region.parentId)!;

const localDocument: UniverseCatalogDocument = {
  schemaVersion: 1, mode: "live", rootId: "synthetic-local-universe", initialTarget: { kind: "planet", id: "synthetic-local-planet" },
  entities: [
    { id: "synthetic-local-universe", kind: "universe", parentId: null, name: "Synthetic local universe", description: "Synthetic user-owned universe.", seed: 11 },
    { id: "synthetic-local-galaxy", kind: "galaxy", parentId: "synthetic-local-universe", name: "Synthetic local galaxy", description: "Synthetic user-owned galaxy.", seed: 12 },
    { id: "synthetic-local-cloud", kind: "cloud", parentId: "synthetic-local-galaxy", name: "Synthetic local cloud", description: "Synthetic user-owned grouping.", seed: 13 },
    { id: "synthetic-local-system", kind: "system", parentId: "synthetic-local-cloud", name: "Synthetic local system", description: "Synthetic user-owned system.", seed: 14 },
    { id: "synthetic-local-planet", kind: "planet", parentId: "synthetic-local-system", name: "Synthetic local note", description: "A synthetic user-owned note that the demo must not rewrite.", seed: 15,
      reference: { label: "Synthetic notebook", href: "https://notes.example/field-notes?keep=yes#saved" }, tags: ["preserve"] },
  ],
};
const savedWorkspace = serializeLocalWorkspace(parseLocalWorkspace({
  schemaVersion: 1, activeUniverseId: localDocument.rootId, universes: [localDocument],
}));

const isProviderHost = (hostname: string) => hostname === "nasa.gov" || hostname.endsWith(".nasa.gov") || hostname === "exoplanetarchive.ipac.caltech.edu" || hostname === "firecrawl.dev" || hostname.endsWith(".firecrawl.dev");

async function prepare(context: BrowserContext, page: Page) {
  await context.addInitScript(({ key, saved }) => {
    localStorage.setItem("hackuniverse.intro.v1.seen", "1");
    localStorage.setItem("hackuniverse.demo-tour.v1.seen", "1");
    localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({ schemaVersion: 1, muted: true, musicEnabled: false, effectsEnabled: false, musicVolume: 0.35, effectsVolume: 0.5 }));
    if (localStorage.getItem(key) === null) localStorage.setItem(key, saved);
    if (localStorage.getItem("hackuniverse.data-source.v1") === null) localStorage.setItem("hackuniverse.data-source.v1", "demo");
  }, { key: workspaceStorageKey, saved: savedWorkspace });
  const errors: string[] = [];
  const providerRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Unexpected ingestion/source fetches fail the assertions without contacting
  // live providers. The explicit source-popup fixture overrides this route.
  await context.route((url) => isProviderHost(url.hostname), (route) => route.abort());
  context.on("request", (request) => {
    const { hostname } = new URL(request.url());
    if (isProviderHost(hostname)) providerRequests.push(request.url());
  });
  return { errors, providerRequests };
}

async function expectStoredWorkspace(page: Page) {
  expect(await page.evaluate((key) => localStorage.getItem(key), workspaceStorageKey)).toBe(savedWorkspace);
}

test("factual demo sources and hierarchy navigation preserve the canvas and local workspace", async ({ page, context }) => {
  const { errors, providerRequests } = await prepare(context, page);
  expect(earth.reference?.href).toBeTruthy();
  expect(trappistPlanets.length).toBeGreaterThan(0);
  const earthSource = earth.reference!.href!;
  await context.route(earthSource, (route) => route.fulfill({
    contentType: "text/html", body: '<!doctype html><link rel="icon" href="data:,"><title>Mock NASA source</title><h1>Mock NASA Earth source</h1>',
  }));
  await page.goto("/?lang=en&source=demo&check=factual-demo#atlas");
  await expect(page.locator('.workspace-host[data-source="demo"]')).toBeVisible();
  await expect(page.locator('.universe-scene[aria-busy]')).toHaveAttribute("aria-busy", "false");
  const canvas = await page.locator("canvas").elementHandle();
  expect(canvas).not.toBeNull();
  const earthPanel = page.getByRole("region", { name: earth.name, exact: true });
  await expect(earthPanel.getByRole("heading", { name: earth.name, exact: true })).toBeVisible();
  await expect(earthPanel.locator(".universe-details-description")).toContainText(earth.description);
  await expect(earthPanel).toContainText("Scientific reference · demo catalog");
  const sourceLink = earthPanel.getByRole("link", { name: "Open source", exact: true });
  await expect(sourceLink).toHaveAttribute("href", earthSource);
  await expect(sourceLink).toHaveAttribute("target", "_blank");
  await expect(sourceLink).toHaveAttribute("rel", "noopener noreferrer");
  expect(providerRequests).toEqual([]);
  const originalUrl = new URL(page.url());
  const [popup] = await Promise.all([context.waitForEvent("page"), sourceLink.click()]);
  await expect(popup.getByRole("heading", { name: "Mock NASA Earth source", exact: true })).toBeVisible();
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  const currentUrl = new URL(page.url());
  expect(currentUrl.origin).toBe(originalUrl.origin);
  expect(currentUrl.pathname).toBe(originalUrl.pathname);
  expect(currentUrl.hash).toBe(originalUrl.hash);
  for (const key of ["lang", "check", "source"]) {
    expect(currentUrl.searchParams.getAll(key)).toEqual(originalUrl.searchParams.getAll(key));
  }
  expect(await canvas!.evaluate((node) => node.isConnected)).toBe(true);
  await popup.close();
  expect(providerRequests).toEqual([earthSource]);

  await page.getByRole("button", { name: "Explorer menu", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Mission controls", exact: true });
  await menu.getByRole("tab", { name: "Go to", exact: true }).click();
  await menu.getByRole("textbox", { name: "Search planets", exact: true }).fill(trappist.name);
  await expect(menu.locator(".universe-menu-planet-text strong")).toHaveText(trappistPlanets.map(({ name }) => name));
  const destination = trappistPlanets[0];
  await menu.locator(".universe-menu-planets button").filter({ has: page.getByText(destination.name, { exact: true }) }).click();
  await expect(menu).toBeHidden();
  const destinationPanel = page.getByRole("region", { name: destination.name, exact: true });
  await expect(destinationPanel.getByRole("heading", { name: destination.name, exact: true })).toBeVisible();
  await expect(destinationPanel.locator(".universe-details-description")).toContainText(destination.description);
  await destinationPanel.getByRole("button", { name: "Back to system", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-scale", "system");
  await expect(page.locator(".universe-context h1")).toHaveText(trappist.name);

  for (const destination of [region, galaxy, demo.entities.find(({ id }) => id === demo.rootId)!]) {
    await page.locator("button.universe-scale-back").click();
    await expect(page.locator("main")).toHaveAttribute("data-scale", destination.kind);
    await expect(page.locator(".universe-context h1")).toHaveText(destination.name);
    if (destination.kind === "cloud") await expect(page.locator(".universe-context > span")).toHaveText("Region");
    expect(await canvas!.evaluate((node) => node.isConnected)).toBe(true);
    await expectStoredWorkspace(page);
  }
  expect(galaxy.name).toBe("Milky Way");
  expect(providerRequests).toEqual([earthSource]);
  expect(errors).toEqual([]);
  await canvas!.dispose();
});

test("the initial Demo neighborhood exposes multiple real systems from Pause", async ({ page, context }) => {
  const { errors, providerRequests } = await prepare(context, page);
  const neighborhood = demo.entities.find(({ id }) => id === "cloud-local-interstellar")!;
  const nearbySystems = demo.entities.filter((entity) => entity.kind === "system" && entity.parentId === neighborhood.id);
  const nearbySystem = nearbySystems.find(({ id }) => id === "system-gj-887")!;
  const nearbyPlanets = demo.planets.filter(({ parentId }) => parentId === nearbySystem.id);
  expect(nearbySystems).toHaveLength(16);
  expect(nearbyPlanets).toHaveLength(4);

  await page.goto("/?lang=en&source=demo&target=planet-earth&check=nearby-systems#neighborhood");
  await expect(page.locator('.universe-scene[aria-busy]')).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("main")).toHaveAttribute("data-scale", "planet");
  const canvas = await page.locator("canvas").elementHandle();
  expect(canvas).not.toBeNull();
  await page.getByRole("button", { name: "Explorer menu", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Mission controls", exact: true });
  await menu.getByRole("tabpanel", { name: "Pause", exact: true }).getByRole("button", { name: "Nearby systems", exact: true }).click();
  await expect(menu).toBeHidden();
  await expect(page.locator("main")).toHaveAttribute("data-scale", "cloud");
  await expect(page.locator(".universe-context h1")).toHaveText(neighborhood.name);
  const systemLabels = page.locator('button.universe-node-label[data-primary="true"][data-destination-kind="system"]');
  await expect(systemLabels).toHaveCount(nearbySystems.length);
  await expect.poll(async () => new Set(await page.locator("button.universe-node-label[data-destination-id]:visible").allTextContents()).size).toBeGreaterThan(1);
  const systemLabel = page.locator(`button.universe-node-label[data-destination-id="${nearbySystem.id}"]`);
  await expect(systemLabel).toHaveText(nearbySystem.name);
  await expect(systemLabel).toBeVisible();
  await systemLabel.click();
  await expect(page.locator("main")).toHaveAttribute("data-scale", "system");
  await expect(page.locator(".universe-context h1")).toHaveText(nearbySystem.name);
  expect(await canvas!.evaluate((node) => node.isConnected)).toBe(true);

  await page.getByRole("button", { name: "Explorer menu", exact: true }).click();
  await menu.getByRole("tab", { name: "Go to", exact: true }).click();
  await menu.getByRole("textbox", { name: "Search planets", exact: true }).fill(nearbySystem.name);
  await expect(menu.locator(".universe-menu-planet-text strong")).toHaveText(nearbyPlanets.map(({ name }) => name));
  const destination = nearbyPlanets[0];
  await menu.locator(".universe-menu-planets button").filter({ has: page.getByText(destination.name, { exact: true }) }).click();
  await expect(menu).toBeHidden();
  const planetPanel = page.getByRole("region", { name: destination.name, exact: true });
  await expect(planetPanel.getByRole("heading", { name: destination.name, exact: true })).toBeVisible();
  await expect(planetPanel.locator(".universe-details-description")).toContainText(destination.description);
  await planetPanel.getByRole("button", { name: "Back to system", exact: true }).click();
  await expect(page.locator(".universe-context h1")).toHaveText(nearbySystem.name);
  expect(await canvas!.evaluate((node) => node.isConnected)).toBe(true);
  await expectStoredWorkspace(page);
  expect(providerRequests).toEqual([]);
  expect(errors).toEqual([]);
  await canvas!.dispose();
});

test("switching and direct entry to Local retain its content and ordinary stellar-cloud label", async ({ page, context }) => {
  const { errors, providerRequests } = await prepare(context, page);
  await page.goto("/?lang=en&source=demo");
  await expect(page.locator('.universe-scene[aria-busy]')).toHaveAttribute("aria-busy", "false");
  await expectStoredWorkspace(page);
  await page.getByRole("button", { name: "Explorer menu", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Mission controls", exact: true });
  await menu.getByRole("tab", { name: "Settings", exact: true }).click();
  await menu.getByRole("button", { name: "Workspace and data", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Workspace and data", exact: true });
  await settings.getByRole("combobox", { name: "Universe source", exact: true }).click();
  await settings.getByRole("option", { name: "Local", exact: true }).click();
  await expect(page.locator('.workspace-host[data-source="local"]')).toBeVisible();
  const localPlanet = localDocument.entities.find(({ id }) => id === "synthetic-local-planet")!;
  const localPanel = page.getByRole("region", { name: localPlanet.name, exact: true });
  await expect(localPanel.getByRole("heading", { name: localPlanet.name, exact: true })).toBeVisible();
  await expect(localPanel.locator(".universe-details-description")).toContainText(localPlanet.description);
  await expectStoredWorkspace(page);
  await localPanel.getByRole("button", { name: "Back to system", exact: true }).click();
  await page.locator("button.universe-scale-back").click();
  await expect(page.locator("main")).toHaveAttribute("data-scale", "cloud");
  await expect(page.locator(".universe-context > span")).toHaveText("Stellar cloud");
  await expect(page.locator(".universe-context h1")).toHaveText("Synthetic local cloud");
  await expectStoredWorkspace(page);

  await page.goto("/?lang=en&source=local&target=synthetic-local-cloud&camera=10,8,20,0,0,0#local-data");
  await expect(page.locator('.workspace-host[data-source="local"]')).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("data-scale", "cloud");
  await expect(page.locator(".universe-context > span")).toHaveText("Stellar cloud");
  await expect(page.locator(".universe-context h1")).toHaveText("Synthetic local cloud");
  await expectStoredWorkspace(page);
  await page.getByRole("button", { name: "Explorer menu", exact: true }).click();
  await expect(menu.getByRole("tabpanel", { name: "Pause", exact: true })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Nearby systems", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(providerRequests).toEqual([]);
  expect(errors).toEqual([]);
});
