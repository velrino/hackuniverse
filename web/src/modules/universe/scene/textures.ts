import * as THREE from "three";
import { getPlanetAppearance } from "../domain/planet-appearance";

// Share generated pixels, while each scene keeps a separately disposable GPU texture.
const planetCanvases = new Map<string, HTMLCanvasElement>();
const planetPixelBudget = 128 * 64 * 48;
let planetPixelCount = 0;

function surfaceTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

/** Original illustrated surfaces, generated locally without remote imagery. */
export function planetTexture(seed: number, color: string, detailed: boolean) {
  const width = detailed ? 256 : 128;
  const height = width / 2;
  const key = `${seed}:${color}:${width}`;
  const cached = planetCanvases.get(key);
  if (cached) {
    planetCanvases.delete(key);
    planetCanvases.set(key, cached);
    return surfaceTexture(cached);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas textures unavailable");
  const image = context.createImageData(width, height);
  const random = seededRandom(seed);
  const { kind } = getPlanetAppearance(seed);
  // Canvas pixels are sRGB values; avoid converting the selected color twice.
  const base = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  const grids = [8, 16, 40].map((size) => ({ width: size, height: size / 2 + 1, values: Float32Array.from({ length: size * (size / 2 + 1) }, random) }));
  const sample = (grid: typeof grids[number], u: number, v: number) => {
    const x = ((u % 1 + 1) % 1) * grid.width;
    const y = THREE.MathUtils.clamp(v, 0, 1) * (grid.height - 1);
    const ix = Math.floor(x);
    const iy = Math.min(Math.floor(y), grid.height - 2);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const next = (ix + 1) % grid.width;
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(grid.values[iy * grid.width + ix], grid.values[iy * grid.width + next], sx),
      THREE.MathUtils.lerp(grid.values[(iy + 1) * grid.width + ix], grid.values[(iy + 1) * grid.width + next], sx), sy,
    );
  };
  const craters = Array.from({ length: kind === "moon" ? 32 : kind === "rocky" ? 16 : 0 }, () => {
    const longitude = random() * Math.PI * 2;
    const latitude = Math.asin(random() * 2 - 1);
    const radius = 0.07 + random() * 0.22;
    return { x: Math.cos(longitude) * Math.cos(latitude), y: Math.sin(latitude), z: Math.sin(longitude) * Math.cos(latitude), edge: 1 - Math.cos(radius) };
  });
  const storms = Array.from({ length: kind === "gas-storm" ? 5 : kind === "gas-bands" ? 2 : 0 }, () => ({ u: random(), v: 0.15 + random() * 0.7, width: 0.04 + random() * 0.09, height: 0.025 + random() * 0.06 }));
  const phase = (seed % 1000) * 0.017;

  for (let y = 0; y < height; y++) {
    const v = y / height;
    const latitude = (v - 0.5) * Math.PI;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const longitude = u * Math.PI * 2;
      const broad = sample(grids[0], u, v);
      const middle = sample(grids[1], u + (broad - 0.5) * 0.08, v);
      const fine = sample(grids[2], u, v);
      const noise = broad * 0.55 + middle * 0.3 + fine * 0.15;
      let shade = 0.64 + noise * 0.36;
      let highlight = 0;
      if (kind === "rocky" || kind === "moon") {
        const sx = Math.cos(longitude) * Math.cos(latitude);
        const sy = Math.sin(latitude);
        const sz = Math.sin(longitude) * Math.cos(latitude);
        shade = 0.58 + noise * 0.4;
        for (const crater of craters) {
          const distance = (1 - sx * crater.x - sy * crater.y - sz * crater.z) / crater.edge;
          if (distance < 1.4) {
            shade *= 0.55 + Math.min(1, distance / 0.68) * 0.45;
            highlight += Math.exp(-Math.pow((distance - 0.95) * 7, 2)) * 0.22;
          }
        }
        if (kind === "moon") highlight += fine * 0.16;
      } else if (kind === "desert") {
        const dune = Math.sin(longitude * 31 + broad * 16 + Math.cos(latitude * 13 + phase) * 2);
        shade = 0.73 + noise * 0.22 + dune * 0.05;
        highlight = Math.max(0, middle - 0.6) * 0.5;
      } else if (kind === "ice") {
        const crack = Math.max(0, 1 - Math.abs(middle - 0.5) * 32);
        shade = 0.83 - crack * 0.34;
        highlight = 0.2 + noise * 0.31;
      } else if (kind === "ocean") {
        const land = THREE.MathUtils.smoothstep(noise, 0.49, 0.55);
        shade = 0.62 + noise * 0.25;
        highlight = land * (0.2 + middle * 0.24);
        const cloud = THREE.MathUtils.smoothstep(sample(grids[1], u + broad * 0.12, v + 0.03), 0.72, 0.86);
        highlight = Math.max(highlight, cloud * 0.55);
        if (Math.abs(latitude) > 1.32) highlight = Math.max(highlight, 0.35);
      } else if (kind === "lava") {
        const fissure = 1 - THREE.MathUtils.smoothstep(Math.abs(middle - 0.5), 0.015, 0.07);
        shade = 0.28 + noise * 0.3 + fissure * 0.25;
        highlight = fissure * (0.28 + fine * 0.2);
      } else {
        const band = Math.sin(latitude * (kind === "gas-bands" ? 36 : 17) + (broad - 0.5) * 5 + Math.sin(longitude * 3 + phase) * 0.65);
        const eddy = Math.sin(longitude * 11 + Math.sin(latitude * 14 + broad * 8) * 2);
        shade = 0.67 + band * 0.14 + noise * 0.17;
        highlight = Math.max(0, band) * 0.14 + (kind === "gas-storm" ? Math.max(0, eddy) * 0.15 : 0);
        for (const storm of storms) {
          let du = Math.abs(u - storm.u);
          du = Math.min(du, 1 - du) / storm.width;
          const dv = (v - storm.v) / storm.height;
          const radius = Math.hypot(du, dv);
          if (radius < 1) {
            const swirl = Math.sin(Math.atan2(dv, du) * 2 + radius * 12);
            shade = THREE.MathUtils.lerp(shade, 0.6 + swirl * 0.16, 1 - radius);
            highlight = Math.max(highlight, (1 - radius) * (0.23 + swirl * 0.14));
          }
        }
      }
      shade = THREE.MathUtils.clamp(shade, 0.15, 1);
      highlight = THREE.MathUtils.clamp(highlight, 0, 0.58);
      const grain = (random() - 0.5) * 6;
      const offset = (y * width + x) * 4;
      // Only mix the selected base with light/shadow: every family retains its hue.
      image.data[offset] = base[0] * shade * (1 - highlight) + 255 * highlight + grain;
      image.data[offset + 1] = base[1] * shade * (1 - highlight) + 255 * highlight + grain;
      image.data[offset + 2] = base[2] * shade * (1 - highlight) + 255 * highlight + grain;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  planetCanvases.set(key, canvas);
  planetPixelCount += width * height;
  while (planetPixelCount > planetPixelBudget) {
    const oldest = planetCanvases.keys().next().value;
    if (oldest === undefined) break;
    const previous = planetCanvases.get(oldest)!;
    planetPixelCount -= previous.width * previous.height;
    planetCanvases.delete(oldest);
  }
  return surfaceTexture(canvas);
}

export function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Glow textures unavailable");
  const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, "rgba(235,255,255,1)");
  glow.addColorStop(0.12, "rgba(115,245,255,.85)");
  glow.addColorStop(0.35, "rgba(50,210,240,.2)");
  glow.addColorStop(1, "rgba(30,160,210,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function starSurfaceTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Star textures unavailable");
  const pixels = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    const latitude = (y / canvas.height - 0.5) * Math.PI;
    for (let x = 0; x < canvas.width; x++) {
      const longitude = x / canvas.width * Math.PI * 2;
      const sx = Math.cos(longitude) * Math.cos(latitude);
      const sy = Math.sin(latitude);
      const sz = Math.sin(longitude) * Math.cos(latitude);
      const granulation = Math.sin(sx * 55 + Math.sin(sz * 37) * 2) * Math.sin(sy * 61 + Math.cos(sx * 29) * 2)
        + Math.cos(sz * 81 + Math.sin(sy * 43) * 1.3) * 0.5;
      const turbulence = Math.sin(sx * 11 + Math.cos(sz * 13) * 2) * Math.cos(sy * 15 + Math.sin(sx * 7));
      const heat = THREE.MathUtils.clamp(0.68 + granulation * 0.13 + turbulence * 0.08, 0, 1);
      const offset = (y * canvas.width + x) * 4;
      pixels.data[offset] = 247 + heat * 8;
      pixels.data[offset + 1] = 120 + heat * 93;
      pixels.data[offset + 2] = 30 + heat * 108;
      pixels.data[offset + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function starCoronaTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Star corona unavailable");
  const corona = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  corona.addColorStop(0, "rgba(255,213,138,.8)");
  corona.addColorStop(0.17, "rgba(255,174,69,.65)");
  corona.addColorStop(0.38, "rgba(247,124,42,.22)");
  corona.addColorStop(0.7, "rgba(247,124,42,.045)");
  corona.addColorStop(1, "rgba(247,124,42,0)");
  context.fillStyle = corona;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A small seamless panorama: colored filaments with intentionally dark windows. */
export function nebulaTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Nebula texture unavailable");
  const pixels = context.createImageData(canvas.width, canvas.height);
  const random = seededRandom(9827);
  const grids = [8, 16, 32].map((width) => ({ width, height: width / 2 + 1, values: Float32Array.from({ length: width * (width / 2 + 1) }, random) }));
  const sample = (grid: typeof grids[number], u: number, v: number) => {
    const x = ((u % 1 + 1) % 1) * grid.width;
    const y = THREE.MathUtils.clamp(v, 0, 1) * (grid.height - 1);
    const ix = Math.floor(x);
    const iy = Math.min(Math.floor(y), grid.height - 2);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const next = (ix + 1) % grid.width;
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(grid.values[iy * grid.width + ix], grid.values[iy * grid.width + next], sx),
      THREE.MathUtils.lerp(grid.values[(iy + 1) * grid.width + ix], grid.values[(iy + 1) * grid.width + next], sx), sy,
    );
  };
  for (let y = 0; y < canvas.height; y++) {
    const v = y / canvas.height;
    for (let x = 0; x < canvas.width; x++) {
      const angle = x / canvas.width * Math.PI * 2;
      const u = x / canvas.width;
      const broad = sample(grids[0], u, v);
      const ribbon = v - 0.5 - Math.sin(angle + 0.7) * 0.22 - (broad - 0.5) * 0.18;
      const body = Math.exp(-(ribbon * ribbon) / 0.018);
      const turbulence = broad * 0.55 + sample(grids[1], u + broad * 0.08, v) * 0.3 + sample(grids[2], u, v) * 0.15;
      const window = 0.18 + broad * 0.82;
      const mist = body * Math.pow(Math.max(0, turbulence - 0.2), 1.6) * window * 5.5;
      const teal = 0.5 + Math.sin(angle + 1.6) * 0.5;
      const amber = Math.max(0, Math.cos(angle * 2 - 1.2)) * 0.4;
      const grain = random() * 1.3;
      const offset = (y * canvas.width + x) * 4;
      pixels.data[offset] = 2 + mist * (18 + amber * 78) + grain;
      pixels.data[offset + 1] = 6 + mist * (24 + teal * 67 + amber * 20) + grain;
      pixels.data[offset + 2] = 14 + mist * (61 + teal * 45) + grain;
      pixels.data[offset + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
