import * as THREE from "three";
import type { PlanetAppearance } from "../domain/planet-appearance";

/** Original analytic concentric bands; no image, texture allocation or per-frame work. */
export function createPlanetRings(radius: number, rings: NonNullable<PlanetAppearance["rings"]>) {
  const inner = radius * rings.inner;
  const outer = radius * rings.outer;
  const material = new THREE.MeshBasicMaterial({ color: rings.color, transparent: true, opacity: rings.opacity, side: THREE.DoubleSide, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.ringInner = { value: inner };
    shader.uniforms.ringWidth = { value: outer - inner };
    shader.vertexShader = `varying vec2 vRingPosition;\n${shader.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\nvRingPosition = position.xy;");
    shader.fragmentShader = `varying vec2 vRingPosition; uniform float ringInner; uniform float ringWidth;\n${shader.fragmentShader}`.replace("#include <color_fragment>", `#include <color_fragment>
      float radial = clamp((length(vRingPosition) - ringInner) / ringWidth, 0.0, 1.0);
      float footprint = fwidth(radial);
      float fineDetail = 1.0 - smoothstep(2.0, 4.5, footprint * 238.0);
      float fineBands = mix(0.26067, 0.08 + 0.92 * pow(0.5 + 0.5 * sin(radial * 238.0), 8.0), fineDetail);
      float broadDetail = 1.0 - smoothstep(0.3, 1.3, footprint * 39.0);
      float broadBands = mix(0.9, 0.9 + 0.1 * sin(radial * 39.0 + 0.8), broadDetail);
      float softness = max(0.02, footprint);
      float gap = 1.0 - 0.88 * (smoothstep(0.5 - softness, 0.5 + softness, radial) - smoothstep(0.55 - softness, 0.55 + softness, radial));
      float edge = smoothstep(0.0, max(0.045, footprint), radial) * (1.0 - smoothstep(1.0 - max(0.06, footprint), 1.0, radial));
      diffuseColor.a *= fineBands * broadBands * gap * edge;
    `);
  };
  material.customProgramCacheKey = () => "planet-concentric-bands-v2";
  const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 128), material);
  mesh.name = "planet-ring-bands";
  return mesh;
}
