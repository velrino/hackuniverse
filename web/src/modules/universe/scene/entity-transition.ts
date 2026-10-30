import * as THREE from "three";
import { createRoundPointMaterial } from "./cluster-visuals";
import { seededRandom } from "./textures";
import type { EntityKind } from "../domain/types";

export type UniverseEntityTransition = { token: string; action: "create" | "delete"; kind: EntityKind; entityId: string; variant?: "burst" | "collapse" };

export const ENTITY_TRANSITION_DURATION_MS = 1350;

type Options = {
  transition: UniverseEntityTransition;
  position: THREE.Vector3;
  radius: number;
  mobile: boolean;
  pointMap: THREE.Texture;
  glowMap: THREE.Texture;
  pixelRatio: () => number;
};

/** A transient two-draw visual; shared maps belong to the scene, not this effect. */
export function createEntityTransition(scene: THREE.Scene, options: Options) {
  const { transition, radius, mobile, pointMap, glowMap, pixelRatio } = options;
  let seed = 2166136261;
  for (const character of `${transition.token}:${transition.entityId}`) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  const random = seededRandom(seed >>> 0);
  const collapse = transition.action === "delete" && (transition.variant ? transition.variant === "collapse" : random() < 0.5);
  const creation = transition.action === "create";
  const spiral = transition.kind === "galaxy";
  const stellar = transition.kind === "system";
  const gaseous = transition.kind === "cloud";
  const bigBang = transition.kind === "universe";
  const count = mobile ? 128 : bigBang ? 320 : 256;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  // radius, azimuth and vertical component: constant seeds, no per-frame allocation.
  const distribution = new Float32Array(count * 3);
  const primary = new THREE.Color(collapse ? 0xa994ff : stellar ? 0xffc36a : 0x42e8f4);
  const secondary = new THREE.Color(collapse ? 0x42e8f4 : stellar ? 0xfff1bf : 0xd8faff);
  const color = new THREE.Color();
  for (let index = 0; index < count; index++) {
    const offset = index * 3;
    distribution[offset] = 0.2 + random() * 0.8;
    distribution[offset + 1] = random() * Math.PI * 2;
    distribution[offset + 2] = random() * 2 - 1;
    color.copy(primary).lerp(secondary, random()).multiplyScalar(1.4);
    color.toArray(colors, offset);
  }
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = createRoundPointMaterial(radius * 0.09, 0xffffff, 1, pointMap, pixelRatio);
  material.vertexColors = true;
  material.blending = THREE.AdditiveBlending;
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const coreMaterial = new THREE.SpriteMaterial({
    map: glowMap, color: primary, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const core = new THREE.Sprite(coreMaterial);
  const group = new THREE.Group();
  group.position.copy(options.position);
  group.add(points, core);
  scene.add(group);
  let disposed = false;

  function update(elapsedMs: number) {
    if (disposed) return true;
    const progress = THREE.MathUtils.clamp(elapsedMs / ENTITY_TRANSITION_DURATION_MS, 0, 1);
    const eased = 1 - (1 - progress) ** 3;
    const fade = Math.sin(Math.PI * (0.08 + progress * 0.92));
    for (let index = 0; index < count; index++) {
      const offset = index * 3;
      const distance = distribution[offset];
      const azimuth = distribution[offset + 1];
      const vertical = distribution[offset + 2];
      let extent: number;
      let angle = azimuth;
      let y = vertical;
      if (collapse) {
        extent = distance * (1 - progress) ** 2 * 2.4;
        angle += progress * 7 + distance * 3;
        y *= 0.2;
      } else if (!creation || bigBang || stellar) {
        extent = distance * (creation ? 0.04 + eased * (bigBang ? 3 : 2) : 0.8 + eased * 3.2);
      } else if (gaseous) {
        extent = 0.35 + distance * (0.2 + eased * 1.7);
        angle += eased * 0.6;
        y = vertical * 0.35 + Math.sin(azimuth * 3 + progress * 2) * 0.18;
      } else if (spiral) {
        extent = distance * (0.08 + eased * 1.8);
        angle = index % 3 * Math.PI * 2 / 3 + distance * 6 + (1 - eased) * 3 + vertical * 0.18;
        y *= 0.08;
      } else {
        // A rotating accretion disc settles into a compact planetary shell.
        extent = 2.4 * distance * (1 - eased) + (0.8 + distance * 0.25) * eased;
        angle += (1 - eased) * 4;
        y *= 0.12 + eased * 0.75;
      }
      const planar = Math.sqrt(Math.max(0, 1 - y * y));
      positions[offset] = Math.cos(angle) * extent * planar * radius;
      positions[offset + 1] = y * extent * radius;
      positions[offset + 2] = Math.sin(angle) * extent * planar * radius;
    }
    positionAttribute.needsUpdate = true;
    material.opacity = Math.max(0, fade);
    const coreSize = radius * (collapse ? Math.max(0.02, (1 - eased) * 3) : 0.2 + eased * (bigBang ? 3.5 : 2));
    core.scale.setScalar(coreSize);
    coreMaterial.opacity = Math.max(0, fade) * (stellar || bigBang || collapse ? 0.8 : 0.4);
    return progress === 1;
  }

  update(0);
  return {
    update,
    setPosition(position: THREE.Vector3) { if (!disposed) group.position.copy(position); },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(group);
      geometry.dispose();
      material.dispose();
      coreMaterial.dispose();
      group.clear();
    },
  };
}
