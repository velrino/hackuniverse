import * as THREE from "three";

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
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas textures unavailable");
  const image = context.createImageData(width, height);
  const random = seededRandom(seed);
  const base = new THREE.Color(color);
  const shade = base.clone().multiplyScalar(0.28);
  const land = base.clone().lerp(new THREE.Color(0xb5d3b5), 0.58);
  const ice = new THREE.Color(0xcdebf3);
  const pixel = new THREE.Color();
  const gas = seed % 3 === 0;

  for (let y = 0; y < height; y++) {
    const latitude = (y / height - 0.5) * Math.PI;
    for (let x = 0; x < width; x++) {
      const longitude = x / width * Math.PI * 2;
      const noise = Math.sin(longitude * 3 + seed) * Math.cos(latitude * 5)
        + Math.sin(longitude * 7 - latitude * 9 + seed * 0.1) * 0.4
        + Math.cos(longitude * 17 + latitude * 11) * 0.15;
      if (gas) {
        const band = 0.45 + Math.sin(latitude * 35 + noise * 0.8) * 0.2;
        pixel.copy(shade).lerp(base, band + 0.2);
      } else {
        pixel.copy(shade).lerp(noise > 0.25 ? land : base, noise > 0.25 ? 0.8 : 0.45);
        if (Math.abs(latitude) > 1.35) pixel.lerp(ice, 0.65);
      }
      const grain = (random() - 0.5) * 12;
      const offset = (y * width + x) * 4;
      image.data[offset] = pixel.r * 255 + grain;
      image.data[offset + 1] = pixel.g * 255 + grain;
      image.data[offset + 2] = pixel.b * 255 + grain;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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
  for (let y = 0; y < canvas.height; y++) {
    const v = y / canvas.height;
    for (let x = 0; x < canvas.width; x++) {
      const angle = x / canvas.width * Math.PI * 2;
      const ribbon = v - 0.5 - Math.sin(angle + 0.7) * 0.22;
      const body = Math.exp(-(ribbon * ribbon) / 0.018);
      const filament = 0.5 + Math.sin(angle * 17 + v * 31 + Math.sin(angle * 5) * 2) * 0.22
        + Math.cos(angle * 37 - v * 63) * 0.16;
      const window = 0.15 + 0.85 * (0.5 + Math.sin(angle * 3 - v * 11) * 0.5);
      const mist = body * filament * filament * window * 2.1;
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
