import * as THREE from "three";

export const ORBIT_GUIDE_LIMIT = 64;
const SEGMENTS = 160;

/** Preserve inner and outer orbits when a large catalog needs a bounded guide budget. */
function guideRadii(input: readonly number[]) {
  const radii = input.filter((radius) => Number.isFinite(radius) && radius > 0);
  if (radii.length <= ORBIT_GUIDE_LIMIT) return radii;
  const inner = radii.slice(0, 8);
  for (let index = 0; index < ORBIT_GUIDE_LIMIT - 8; index++) {
    inner.push(radii[8 + Math.round(index * (radii.length - 9) / (ORBIT_GUIDE_LIMIT - 9))]);
  }
  return inner;
}

/** Two thin, shared draws per system: continuous paths and restrained short accents. */
export function createOrbitGuides(input: readonly number[]) {
  const radii = guideRadii(input);
  const root = new THREE.Group();
  root.name = "system-orbit-guides";
  const materials: THREE.LineBasicMaterial[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const outer = Math.max(1, ...radii);
  const makeLines = (accent: boolean) => {
    const count = accent ? 12 : SEGMENTS;
    const positions = new Float32Array(radii.length * count * 6);
    let offset = 0;
    radii.forEach((radius, orbit) => {
      for (let index = 0; index < count; index++) {
        const start = accent ? orbit * 2.399963 + index / SEGMENTS * Math.PI * 2 : index / SEGMENTS * Math.PI * 2;
        const end = start + Math.PI * 2 / SEGMENTS;
        positions.set([Math.cos(start) * radius, 0, Math.sin(start) * radius, Math.cos(end) * radius, 0, Math.sin(end) * radius], offset);
        offset += 6;
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: accent ? 0x8de6f0 : 0x39b5cb, transparent: true, opacity: accent ? 0.14 : 0.2, depthWrite: false, toneMapped: false });
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = accent ? "orbit-path-accents" : "orbit-paths";
    root.add(lines); materials.push(material); geometries.push(geometry);
  };
  if (radii.length) { makeLines(false); makeLines(true); }
  const center = new THREE.Vector3();
  const scale = new THREE.Vector3();
  let disposed = false;
  return {
    root,
    count: radii.length,
    update(camera: THREE.PerspectiveCamera, height: number, position = camera.position) {
      if (disposed || !materials.length) return;
      for (let ancestor: THREE.Object3D | null = root; ancestor; ancestor = ancestor.parent) {
        if (!ancestor.visible) return;
      }
      root.getWorldPosition(center); root.getWorldScale(scale);
      const pixels = outer * Math.max(scale.x, scale.y, scale.z) * height / (Math.max(position.distanceTo(center), 0.001) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      const detail = THREE.MathUtils.smoothstep(pixels, 24, 320);
      materials[0].opacity = 0.075 + detail * 0.125;
      materials[1].opacity = 0.04 + detail * 0.1;
    },
    dispose() {
      if (disposed) return;
      disposed = true; root.removeFromParent();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}
