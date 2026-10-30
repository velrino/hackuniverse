export const planetKinds = ["rocky", "desert", "ice", "ocean", "lava", "gas-bands", "gas-storm", "moon"] as const;
export type PlanetKind = typeof planetKinds[number];

export type PlanetAppearance = Readonly<{
  kind: PlanetKind;
  color: string;
  radius: number;
  /** Axial tilt in radians, shared by the globe and its rings. */
  tilt: number;
  roughness: number;
  metalness: number;
  rings: Readonly<{ color: string; inner: number; outer: number; opacity: number }> | null;
}>;

function hash(seed: number) {
  let value = seed >>> 0;
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return (value ^ value >>> 16) >>> 0;
}

function hslHex(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs(segment % 2 - 1));
  const sectors = [[chroma, secondary, 0], [secondary, chroma, 0], [0, chroma, secondary], [0, secondary, chroma], [secondary, 0, chroma], [chroma, 0, secondary]];
  const offset = lightness - chroma / 2;
  return `#${sectors[Math.floor(segment) % 6].map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** Exactly 100 unique base colors, spread across warm and cool hues. */
export const planetPalette: readonly string[] = Object.freeze(Array.from({ length: 100 }, (_, index) =>
  hslHex(index * 137.50776405003785 % 360, 0.5 + index % 5 * 0.065, 0.42 + Math.floor(index / 5) % 4 * 0.065),
));

// Reserved visual seeds keep the deliberately ordinary Solar System example
// recognizable without teaching the renderer about catalog IDs or suppliers.
type SolarSystemPreset = Readonly<{ color?: string; rings?: NonNullable<PlanetAppearance["rings"]> }>;
const curatedSolarSystemPresets: Readonly<Partial<Record<number, SolarSystemPreset>>> = Object.freeze({
  195956: Object.freeze({ color: "#9b9790" }),
  105756: Object.freeze({ rings: Object.freeze({ color: "#8fa7bc", inner: 1.7, outer: 2.55, opacity: 0.24 }) }),
});

const sizes: Record<PlanetKind, readonly [number, number]> = {
  rocky: [0.85, 1.35], desert: [1.05, 1.65], ice: [0.95, 1.6], ocean: [1.1, 1.8],
  lava: [0.9, 1.5], "gas-bands": [1.65, 2.25], "gas-storm": [1.55, 2.2], moon: [0.65, 1.05],
};
const roughness: Record<PlanetKind, number> = { rocky: 0.96, desert: 1, ice: 0.35, ocean: 0.3, lava: 0.72, "gas-bands": 0.9, "gas-storm": 0.82, moon: 1 };
const metalness: Record<PlanetKind, number> = { rocky: 0.08, desert: 0.02, ice: 0.08, ocean: 0.02, lava: 0.12, "gas-bands": 0, "gas-storm": 0, moon: 0.03 };

function ringColor(color: string) {
  return `#${[1, 3, 5].map((offset) => Math.round(parseInt(color.slice(offset, offset + 2), 16) * 0.65 + 244 * 0.35).toString(16).padStart(2, "0")).join("")}`;
}

/** Stable identity: independent of catalog order, locale, camera and refresh. */
export function getPlanetAppearance(seed: number): PlanetAppearance {
  const color = curatedSolarSystemPresets[seed]?.color ?? planetPalette[hash(seed ^ 0x61c88647) % planetPalette.length];
  const kind = planetKinds[hash(seed ^ 0x9e3779b9) % planetKinds.length];
  const variation = hash(seed ^ 0x85ebca6b) / 0xffffffff;
  const [minimum, maximum] = sizes[kind];
  const gas = kind === "gas-bands" || kind === "gas-storm";
  const ringChance = hash(seed ^ 0xc2b2ae35) / 0xffffffff;
  return {
    kind,
    color,
    radius: minimum + (maximum - minimum) * variation,
    tilt: (hash(seed ^ 0x27d4eb2f) / 0xffffffff - 0.5) * 1.2,
    roughness: roughness[kind],
    metalness: metalness[kind],
    rings: curatedSolarSystemPresets[seed]?.rings ?? (ringChance < (gas ? 0.7 : kind === "ice" ? 0.24 : 0.07) ? {
      color: ringColor(color), inner: 1.3 + variation * 0.12, outer: 1.75 + variation * 0.25, opacity: 0.32 + variation * 0.2,
    } : null),
  };
}
