#!/usr/bin/env node
/** Rebuild the demo offline from committed, source-hashed astronomy snapshots. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const assets = new URL("../../assets/data/astronomy/", import.meta.url);
const destination = new URL("../src/modules/universe/data/demo-universe.json", import.meta.url);
const bounds = Object.freeze({
  maxPlanets: 1024,
  maxExoplanetHosts: 512,
  maxRegions: 32,
  maxSystemsPerRegion: 16,
  sourceRadiusPc: 100,
});
const priorityHosts = ["Barnard's star", "Ross 128", "GJ 411", "TRAPPIST-1", "GJ 876", "LHS 1140", "eps Eri"];
const json = async (name) => JSON.parse(await readFile(new URL(name, assets), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const seed = (id) => createHash("sha256").update(`HackUniverse astronomy demo:${id}`).digest().readUInt32LE(0);
const slug = (name) => name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const positive = (value) => finite(value) && value > 0;
const format = (value) => Number(value.toPrecision(6)).toString();
const compareName = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const overview = (name) => `https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(name)}`;

const manifest = await json("source-manifest.json");
const [assignments, curated, identities] = await Promise.all([
  json(manifest.constellationSnapshot),
  json("curated-objects.json"),
  json("legacy-identities.json"),
]);
assert.equal(manifest.sourceRadiusPc, bounds.sourceRadiusPc, "The source radius changed without an explicit bound review");
const rawBytes = await readFile(new URL(manifest.rawSnapshot, assets));
const constellationBytes = await readFile(new URL(manifest.constellationSnapshot, assets));
assert.equal(sha256(rawBytes), manifest.rawSha256, "NASA snapshot hash mismatch");
assert.equal(sha256(constellationBytes), manifest.constellationSha256, "Constellation snapshot hash mismatch");
const rows = JSON.parse(rawBytes.toString("utf8"));
const planetNames = new Set();
const grouped = new Map();
for (const row of rows) {
  assert.equal(row.pl_controv_flag, 0);
  assert.equal(row.sy_snum, 1, "One-star render anchors require a single-star source selection");
  assert.equal(row.cb_flag, 0);
  assert.ok(typeof row.hostname === "string" && row.hostname.trim());
  assert.ok(typeof row.pl_name === "string" && row.pl_name.trim());
  assert.ok(!planetNames.has(row.pl_name), `Duplicate source planet: ${row.pl_name}`);
  planetNames.add(row.pl_name);
  if (!grouped.has(row.hostname)) grouped.set(row.hostname, []);
  grouped.get(row.hostname).push(row);
}

const hosts = [...grouped].map(([name, planets]) => {
  const constellation = assignments.hosts[name];
  assert.ok(constellation?.abbreviation && constellation?.name, `No IAU region for ${name}`);
  assert.ok(planets.some((row) => row.ra === constellation.raDeg && row.dec === constellation.decDeg), `IAU coordinates differ from the source for ${name}`);
  const distances = planets.map((row) => row.sy_dist).filter(positive);
  assert.ok(distances.length > 0, `No source distance for ${name}`);
  const distance = Math.min(...distances);
  assert.ok(distance <= bounds.sourceRadiusPc);
  planets.sort((a, b) => (positive(a.pl_orbper) ? a.pl_orbper : Infinity) - (positive(b.pl_orbper) ? b.pl_orbper : Infinity) || compareName(a.pl_name, b.pl_name));
  return { name, planets, distance, constellation, priority: priorityHosts.includes(name) };
});
for (const name of priorityHosts) assert.ok(grouped.has(name), `Required nearby source host is absent: ${name}`);

const rankHost = (a, b) => Number(b.priority) - Number(a.priority) || b.planets.length - a.planets.length || a.distance - b.distance || compareName(a.name, b.name);
const regional = new Map();
for (const host of hosts) {
  const abbreviation = host.constellation.abbreviation;
  if (!regional.has(abbreviation)) regional.set(abbreviation, { abbreviation, name: host.constellation.name, hosts: [] });
  regional.get(abbreviation).hosts.push(host);
}
for (const region of regional.values()) {
  region.hosts.sort(rankHost);
  region.hosts = region.hosts.slice(0, bounds.maxSystemsPerRegion);
  region.planets = region.hosts.reduce((sum, host) => sum + host.planets.length, 0);
  region.priority = region.hosts.some((host) => host.priority);
}
// Rank real sky regions by the eligible whole systems they can show within the
// per-region budget. This is a curated demo, never a claim of a complete census.
const regions = [...regional.values()].sort((a, b) => Number(b.priority) - Number(a.priority) || b.planets - a.planets || compareName(a.name, b.name)).slice(0, bounds.maxRegions - 1);
let planetCount = curated.solarSystem.planets.length;
let hostCount = 0;
const selectedHosts = new Set();
for (const host of regions.flatMap((region) => region.hosts).sort(rankHost)) {
  if (hostCount >= bounds.maxExoplanetHosts || planetCount + host.planets.length > bounds.maxPlanets) continue;
  selectedHosts.add(host.name);
  hostCount++;
  planetCount += host.planets.length;
}
for (const name of priorityHosts) assert.ok(selectedHosts.has(name), `A priority host was removed by the bounds: ${name}`);
const nearbySelection = curated.nearbySelection;
assert.ok(Array.isArray(nearbySelection.hostNames) && nearbySelection.hostNames.length > 0);
assert.equal(new Set(nearbySelection.hostNames).size, nearbySelection.hostNames.length, "Nearby host names must be unique");
assert.ok(nearbySelection.hostNames.length + 1 <= bounds.maxSystemsPerRegion, "The Solar Neighborhood exceeds its system budget");
assert.ok(positive(nearbySelection.maxDistancePc) && nearbySelection.maxDistancePc <= bounds.sourceRadiusPc);
const nearbyHosts = nearbySelection.hostNames.map((name) => {
  const host = hosts.find((entry) => entry.name === name);
  assert.ok(host, `A curated nearby host is absent from the source: ${name}`);
  assert.ok(!selectedHosts.has(name), `A nearby host already belongs to a constellation region: ${name}`);
  assert.ok(host.distance <= nearbySelection.maxDistancePc, `A nearby host exceeds the local distance selection: ${name}`);
  assert.ok(hostCount + 1 <= bounds.maxExoplanetHosts && planetCount + host.planets.length <= bounds.maxPlanets, "The additional nearby systems exceed the demo catalog bounds");
  selectedHosts.add(name);
  hostCount++;
  planetCount += host.planets.length;
  return host;
});
assert.ok(nearbyHosts.every((host, index) => index === 0 || nearbyHosts[index - 1].distance <= host.distance), "Nearby systems must retain their curated distance ordering");
assert.ok(planetCount > 738, "The factual expansion must exceed the previous 738-planet fixture");

function planetNode(row, constellation) {
  const id = `planet-${slug(row.pl_name)}`;
  const facts = [`${row.pl_name} is a confirmed exoplanet orbiting ${row.hostname}.`];
  if (Number.isInteger(row.disc_year)) {
    facts.push(`${row.discoverymethod ? `Its discovery by ${row.discoverymethod.toLowerCase()}` : "Its discovery"} was announced in ${row.disc_year}.`);
  }
  if (positive(row.pl_orbper) && row.pl_orbperlim === 0) {
    facts.push(`The archive reports an orbital period of approximately ${format(row.pl_orbper)} days.`);
  }
  return {
    id, name: row.pl_name, description: facts.join(" "), seed: seed(id), type: "demo",
    reference: { label: `NASA Exoplanet Archive / ${row.pl_name}`, href: overview(row.pl_name) },
    tags: ["confirmed exoplanet", "NASA Exoplanet Archive", row.hostname, constellation.name, ...(row.discoverymethod ? [row.discoverymethod] : [])],
  };
}

function systemNode(host) {
  const legacy = identities.hostSystems[host.name];
  const id = legacy?.id ?? `system-${slug(host.name)}`;
  const quality = (row) => [row.st_spectype, row.st_teff, row.st_rad, row.st_age].filter((value) => value !== null && value !== "").length;
  const stellar = [...host.planets].sort((a, b) => quality(b) - quality(a) || compareName(a.pl_name, b.pl_name))[0];
  const star = {
    name: host.name,
    description: `${host.name} is the host star of the confirmed planets shown in this system. Stellar parameters, where supplied, come from the pinned NASA Exoplanet Archive snapshot.`,
    ...(stellar.st_spectype?.trim() ? { spectralType: stellar.st_spectype } : {}),
    ...(positive(stellar.st_teff) && stellar.st_tefflim === 0 ? { temperatureK: stellar.st_teff } : {}),
    ...(positive(stellar.st_rad) && stellar.st_radlim === 0 ? { radiusKm: stellar.st_rad * curated.sunRadiusKm } : {}),
    ...(positive(stellar.st_age) && stellar.st_age <= 13.8 && stellar.st_agelim === 0 ? { ageBillionYears: stellar.st_age } : {}),
    reference: { label: "NASA Exoplanet Archive", href: overview(host.name) },
  };
  return {
    id, name: host.name,
    description: `A single-star planetary system at an archive-reported distance of approximately ${format(host.distance)} parsecs. This demonstration includes ${host.planets.length} non-controversial confirmed ${host.planets.length === 1 ? "planet" : "planets"} from the source snapshot; it is not a claim that no other planets exist.`,
    seed: legacy?.seed ?? seed(id), type: "demo", star,
    planets: host.planets.map((row) => planetNode(row, host.constellation)),
  };
}

const constellationRegions = regions.map((region) => {
  const id = `region-constellation-${region.abbreviation.toLowerCase()}`;
  return {
    id, name: region.name,
    description: `${region.name} is an IAU constellation: a bounded region of the sky as seen from Earth. The nearby Milky Way systems shown here are grouped by sky direction, not by a shared physical cloud or stellar association.`,
    seed: seed(id), type: "demo",
    systems: region.hosts.filter((host) => selectedHosts.has(host.name)).sort((a, b) => a.distance - b.distance || compareName(a.name, b.name)).map(systemNode),
  };
}).filter((region) => region.systems.length > 0).sort((a, b) => compareName(a.name, b.name));

const galaxies = curated.galaxies.map((galaxy) => ({
  id: galaxy.id, name: galaxy.name, description: galaxy.description,
  seed: galaxy.seed ?? seed(galaxy.id), type: "demo",
  clouds: galaxy.id === "galaxy-milky-way" ? [{ ...curated.solarRegion, systems: [curated.solarSystem, ...nearbyHosts.map(systemNode)] }, ...constellationRegions] : [],
}));
const allSystems = galaxies.flatMap((galaxy) => galaxy.clouds.flatMap((region) => region.systems));
const allPlanets = allSystems.flatMap((system) => system.planets);
assert.equal(allPlanets.length, planetCount);
const ids = [curated.universe.id, ...galaxies.flatMap((galaxy) => [galaxy.id, ...galaxy.clouds.flatMap((region) => [region.id, ...region.systems.flatMap((system) => [system.id, ...system.planets.map((planet) => planet.id)])])])];
assert.equal(new Set(ids).size, ids.length, "Generated application IDs must be unique");

/** Explicit canonical kinds support storage and aggregation without inferring a collection's role. */
function withKinds(node, kind) {
  assert.ok(node.kind === undefined || node.kind === kind, "Declared authoring kind must agree with its hierarchy");
  const child = {
    universe: ["galaxies", "galaxy"],
    galaxy: ["clouds", "cloud"],
    cloud: ["systems", "system"],
    system: ["planets", "planet"],
  }[kind];
  return {
    id: node.id,
    kind,
    ...node,
    ...(child ? { [child[0]]: node[child[0]].map((value) => withKinds(value, child[1])) } : {}),
  };
}

const output = {
  catalog: { schemaVersion: 1, mode: "demo", initialTarget: { kind: "planet", id: "planet-earth" } },
  universe: withKinds({ ...curated.universe, galaxies }, "universe"),
  provenance: {
    source: "NASA Exoplanet Archive / Planetary Systems Composite Parameters",
    retrievedAt: manifest.retrievedAt,
    table: manifest.table,
    query: manifest.query,
    sourceSnapshot: `assets/data/astronomy/${manifest.rawSnapshot}`,
    sourceSha256: manifest.rawSha256,
    constellationSnapshot: `assets/data/astronomy/${manifest.constellationSnapshot}`,
    constellationSha256: manifest.constellationSha256,
    constellationMethod: assignments.method,
    astropyVersion: assignments.astropyVersion,
    bounds,
    selection: "Single-star, non-circumbinary confirmed planets with no published confirmation controversy; complete eligible host groups selected from a 100 pc source pool. Priority nearby hosts precede planet-rich hosts; the 31 highest-ranked real constellation regions are retained. Fifteen additional eligible nearby hosts are added to Solar Neighborhood without moving any existing constellation system. This is a bounded demonstration, not a full nearby census.",
    priorityHosts,
    nearbySelection: { ...nearbySelection, addedSystems: nearbyHosts.length, addedPlanets: nearbyHosts.reduce((sum, host) => sum + host.planets.length, 0) },
    counts: { galaxies: galaxies.length, regions: 1 + constellationRegions.length, systems: allSystems.length, exoplanetHosts: hostCount, planets: planetCount, exoplanets: planetCount - curated.solarSystem.planets.length, entities: ids.length },
    descriptions: "Planet descriptions use source names, host relationships, discovery year/method and only positive orbital periods with a zero limit flag. Missing facts are omitted. No climate, surface, habitability or life claim is inferred for an exoplanet.",
    stellarParameters: "Optional non-limited stellar temperature, radius and age are copied from a source row; stellar radius in Solar radii is multiplied by NASA's 695700 km nominal Solar radius. Composite fields can have different literature references, retained in the raw snapshot. Stellar age estimates above the approximately 13.8-billion-year age of the universe are omitted from display because this interface does not show their uncertainties; the raw NASA snapshot is unchanged.",
    appearance: "Visual seeds preserve deterministic illustrations. Positions, colors, surfaces, rings, sizes, spacing and motion are not observed exoplanet measurements.",
    galaxySources: Object.fromEntries(curated.galaxies.map((galaxy) => [galaxy.id, galaxy.source])),
    solarSources: [curated.solarFactsSource, ...curated.solarSystem.planets.map((planet) => planet.reference.href), curated.solarSystem.star.reference.href],
    references: [manifest.tableDocumentation, manifest.compositeCaveats, manifest.attributionGuidance, assignments.iauReference, assignments.source, "https://science.nasa.gov/exoplanets/what-is-the-universe/"],
    attribution: manifest.attribution,
  },
};
const serialized = JSON.stringify(output, null, 2) + "\n";
if (process.argv.includes("--check")) {
  assert.equal(await readFile(destination, "utf8"), serialized, "Demo JSON differs from the offline generator output");
} else {
  await writeFile(destination, serialized);
}
console.log(JSON.stringify({ output: "web/src/modules/universe/data/demo-universe.json", ...output.provenance.counts, maxSystemsInRegion: Math.max(...galaxies.flatMap((galaxy) => galaxy.clouds.map((region) => region.systems.length))), bytes: Buffer.byteLength(serialized), checked: process.argv.includes("--check") }));
