import * as THREE from "three";
import { seededRandom } from "./textures";

export const GALAXY_PARTICLES = {
  count: 640,
  size: 0.035,
  opacity: 0.9,
  coreScale: 1.05,
  coreFlattening: 0.6,
} as const;

// Authored sRGB colors become linear working RGB through THREE.Color.
const stellarColors = ["#65dcff", "#a0bdff", "#c4a3ff", "#f5a9d8", "#ffc98e", "#d5f5ff"]
  .map((hex) => new THREE.Color(hex));

/** A neutral mask keeps stellar hues independent of the cyan UI glow texture. */
export function galaxyParticleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Galaxy particle texture unavailable");
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.3, "rgba(255,255,255,.85)");
  gradient.addColorStop(0.7, "rgba(255,255,255,.25)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

/** One bounded spiral buffer, independent of the number of catalog descendants. */
export function createGalaxyParticleGeometry(seed: number, extent: number) {
  const positions = new Float32Array(GALAXY_PARTICLES.count * 3);
  const colors = new Float32Array(positions.length);
  const random = seededRandom(seed);
  const colorRandom = seededRandom(seed ^ 0x6a09e667);
  const color = new THREE.Color();
  const orientation = random() * Math.PI * 2;
  for (let index = 0; index < GALAXY_PARTICLES.count; index++) {
    const distance = Math.sqrt(random());
    const radius = distance * extent;
    const arm = index % 4 * Math.PI / 2;
    const angle = orientation + arm + distance * 5.8 + (random() - 0.5) * (0.18 + distance * 0.3);
    positions.set([
      Math.cos(angle) * radius,
      (random() - 0.5) * extent * (0.025 + (1 - distance) * 0.035),
      Math.sin(angle) * radius,
    ], index * 3);
    color.copy(stellarColors[Math.floor(colorRandom() * stellarColors.length)])
      .multiplyScalar(1.8 + colorRandom() * 1.4);
    color.toArray(colors, index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}
