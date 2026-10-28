import * as THREE from "three";
import { createGalaxyParticleGeometry, GALAXY_PARTICLES } from "./galaxy-particles";

export type ClusterVisualResources = {
  glowMap: THREE.Texture;
  coronaMap: THREE.Texture;
  galaxyPointMap: THREE.Texture;
  pixelRatio: number | (() => number);
};

export type GalaxyVisual = { dust: THREE.Points; core: THREE.Sprite };
export type CloudHaze = { primary: THREE.Sprite; secondary: THREE.Sprite };

export function createGlow(
  parent: THREE.Object3D,
  scale: number,
  color: THREE.ColorRepresentation,
  opacity: number,
  map: THREE.Texture,
  toneMapped = true,
) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map, color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped,
  }));
  sprite.scale.set(scale, scale, 1);
  parent.add(sprite);
  return sprite;
}

/** The existing one-to-five CSS pixel particle cap, independent of DPR. */
export function createRoundPointMaterial(
  size: number,
  color: THREE.ColorRepresentation,
  opacity: number,
  map: THREE.Texture,
  pixelRatio: ClusterVisualResources["pixelRatio"],
) {
  const material = new THREE.PointsMaterial({
    map, color, size, transparent: true, opacity, alphaTest: 0.025,
    depthWrite: false, toneMapped: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.pointPixelRatio = { value: typeof pixelRatio === "function" ? pixelRatio() : pixelRatio };
    shader.vertexShader = `uniform float pointPixelRatio;\n${shader.vertexShader}`.replace(
      "#include <logdepthbuf_vertex>",
      "gl_PointSize = clamp(gl_PointSize, pointPixelRatio, 5.0 * pointPixelRatio);\n#include <logdepthbuf_vertex>",
    );
  };
  return material;
}

export function createGalaxyVisual(
  parent: THREE.Object3D,
  seed: number,
  extent: number,
  resources: ClusterVisualResources,
  elapsed: number,
): GalaxyVisual {
  const geometry = createGalaxyParticleGeometry(seed, extent);
  const material = createRoundPointMaterial(
    extent * GALAXY_PARTICLES.size, 0xffffff, GALAXY_PARTICLES.opacity,
    resources.galaxyPointMap, resources.pixelRatio,
  );
  material.vertexColors = true;
  material.blending = THREE.AdditiveBlending;
  const dust = new THREE.Points(geometry, material);
  parent.add(dust);
  const core = createGlow(parent, extent * GALAXY_PARTICLES.coreScale, 0xb9e7ff, 0.65, resources.glowMap, false);
  const visual = { dust, core };
  updateGalaxyVisual(visual, seed, extent, elapsed);
  return visual;
}

export function updateGalaxyVisual({ dust, core }: GalaxyVisual, seed: number, extent: number, elapsed: number) {
  const phase = seed * 0.001;
  dust.rotation.y = elapsed * 0.018 + phase;
  const pulse = 1 + Math.sin(elapsed * 0.35 + phase) * 0.025;
  const size = extent * GALAXY_PARTICLES.coreScale * pulse;
  core.scale.set(size, size * GALAXY_PARTICLES.coreFlattening, 1);
}

export function createCloudHaze(
  parent: THREE.Object3D,
  extent: number,
  color: THREE.ColorRepresentation,
  resources: ClusterVisualResources,
): CloudHaze {
  const primary = createGlow(parent, extent * 2.8, color, 0.5, resources.glowMap);
  primary.scale.y *= 0.55;
  const secondary = createGlow(parent, extent * 1.6, 0x4b71b0, 0.3, resources.glowMap);
  secondary.position.set(extent * 0.25, extent * 0.08, -extent * 0.15);
  return { primary, secondary };
}

export function updateCloudHaze(haze: CloudHaze, seed: number, extent: number, elapsed: number) {
  const phase = seed * 0.001;
  haze.primary.scale.y = extent * 2.8 * (0.55 + Math.sin(elapsed * 0.2 + phase) * 0.025);
  haze.secondary.position.x = extent * (0.25 + Math.sin(elapsed * 0.15 + phase) * 0.06);
  haze.secondary.position.y = extent * (0.08 + Math.cos(elapsed * 0.17 + phase) * 0.035);
}
