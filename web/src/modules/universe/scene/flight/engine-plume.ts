import * as THREE from "three";

/** A small shared cone pair, with an original procedural cyan exhaust gradient. */
export function createEnginePlume() {
  const pixels = new Uint8Array(8 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 8; x++) {
    const i = (y * 8 + x) * 4;
    pixels[i] = 130;
    pixels[i + 1] = 242;
    pixels[i + 2] = 255;
    pixels[i + 3] = Math.round(210 * (1 - y / 31) ** 1.5);
  }
  const texture = new THREE.DataTexture(pixels, 8, 32);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.ConeGeometry(1, 1, 10, 1, true);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    map: texture, color: 0xa1f7ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const object = new THREE.Group();
  object.visible = false;
  const left = new THREE.Mesh(geometry, material);
  const right = new THREE.Mesh(geometry, material);
  object.add(left, right);
  let heat = 0;
  let elapsed = 0;
  let disposed = false;

  return {
    object,
    update(delta: number, throttle: number, boost: boolean, reducedMotion: boolean) {
      if (disposed) return;
      const demand = Math.min(1, Math.abs(throttle));
      heat += ((demand > 0.01 ? demand * (boost ? 1.5 : 1) : 0.06) - heat) * (1 - Math.exp(-8 * delta));
      elapsed += delta;
      const shimmer = reducedMotion ? 1 : 1 + Math.sin(elapsed * 19) * 0.035;
      const length = (0.045 + heat * 0.3) * shimmer;
      const width = 0.014 + heat * 0.012;
      material.opacity = Math.min(0.85, heat * 0.55);
      left.scale.set(width, width, length);
      right.scale.copy(left.scale);
      left.position.set(-0.038, -0.006, 0.16 + length / 2);
      right.position.set(0.038, -0.006, 0.16 + length / 2);
      object.visible = material.opacity > 0.005;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      object.removeFromParent();
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
