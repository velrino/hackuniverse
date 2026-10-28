import * as THREE from "three";
import { seededRandom } from "./textures";
import { clusterScale, previewScale } from "./layout";
import type { UniverseSceneView } from "../domain/types";

/** Direct entry uses the same physical units as traversing the nested previews. */
export function canonicalBackgroundScale(view: UniverseSceneView, sceneRadius: number) {
  if (view.mode !== "cluster") return sceneRadius;
  const systems = clusterScale([{ kind: "system" }]);
  const clouds = clusterScale([{ kind: "cloud" }]);
  const galaxies = clusterScale([{ kind: "galaxy" }]);
  const cloudScale = systems.marker;
  const galaxyScale = cloudScale * previewScale({ kind: "cloud", children: [{ kind: "system" }] }, clouds.marker);
  const universeScale = galaxyScale * previewScale({ kind: "galaxy", children: [{ kind: "cloud" }] }, galaxies.marker);
  const kind = view.nodes[0]?.kind;
  if (kind === "system" || view.key.startsWith("cloud:")) return cloudScale * sceneRadius / systems.radius;
  if (kind === "cloud" || view.key.startsWith("galaxy:")) return galaxyScale * sceneRadius / clouds.radius;
  if (kind === "galaxy" || view.key.startsWith("universe:")) return universeScale * sceneRadius / galaxies.radius;
  return sceneRadius;
}

/** Finite decorative space, independent of catalog markers and picking. */
export function createSpatialBackground(scene: THREE.Scene) {
  const root = new THREE.Group();
  root.name = "spatial-background";
  root.scale.setScalar(40);
  scene.add(root);

  const layers = [
    { count: 500, inner: 4, outer: 25 },
    { count: 1300, inner: 25, outer: 220 },
    { count: 1800, inner: 220, outer: 4800 },
  ];
  const count = layers.reduce((total, layer) => total + layer.count, 0);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const ranks = new Float32Array(count);
  const random = seededRandom(4924);
  let index = 0;
  layers.forEach((layer, layerIndex) => {
    for (let point = 0; point < layer.count; point++, index++) {
      const longitude = random() * Math.PI * 2;
      // A broad stellar band adds depth without inventing selectable entities.
      const latitude = random() < 0.45 ? (random() - 0.5) * 0.65 : random() * 2 - 1;
      const radius = layer.inner * Math.pow(layer.outer / layer.inner, random());
      const planar = Math.sqrt(1 - latitude * latitude);
      positions.set([Math.cos(longitude) * planar * radius, latitude * radius, Math.sin(longitude) * planar * radius], index * 3);
      const warmth = random();
      const light = 0.7 + random() * 0.3;
      colors.set([light * (0.76 + warmth * 0.24), light * (0.87 + warmth * 0.08), light * (1 - warmth * 0.22)], index * 3);
      sizes[index] = 0.007 + Math.pow(random(), 3) * (0.04 + layerIndex * 0.07);
      ranks[index] = random() * 0.8 + layerIndex * 0.06;
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aRank", new THREE.BufferAttribute(ranks, 1));
  const uniforms = {
    uWorldScale: { value: 40 },
    uProjectionScale: { value: 1 },
    uPixelRatio: { value: 1 },
    uDensity: { value: 0.55 },
    uIntensity: { value: 0.9 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aRank;
      uniform float uWorldScale;
      uniform float uProjectionScale;
      uniform float uPixelRatio;
      uniform float uDensity;
      uniform float uIntensity;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 point = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * point;
        // Finite positions create parallax; decorative stars stay behind planets.
        gl_Position.z = gl_Position.w * 0.99999;
        float pixels = aSize * uWorldScale * uProjectionScale / max(0.1, -point.z);
        gl_PointSize = clamp(pixels, 0.7, 4.6) * uPixelRatio;
        vColor = aColor;
        vAlpha = smoothstep(aRank - 0.07, aRank + 0.07, uDensity) * uIntensity;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
        if (radius > 1.0 || vAlpha < 0.001) discard;
        float core = pow(max(0.0, 1.0 - radius), 5.0);
        float halo = exp(-radius * radius * 5.5);
        gl_FragColor = vec4(vColor * (0.9 + core * 0.7), (halo * 0.7 + core * 0.7) * vAlpha);
        #include <colorspace_fragment>
      }
    `,
  });
  const stars = new THREE.Points(geometry, material);
  stars.frustumCulled = false;
  stars.renderOrder = -90;
  root.add(stars);

  return {
    reset(sceneRadius: number, view?: UniverseSceneView) {
      root.position.set(0, 0, 0);
      root.scale.setScalar(view ? canonicalBackgroundScale(view, sceneRadius) : sceneRadius);
    },
    remap(scale: number, translation: THREE.Vector3) {
      root.position.multiplyScalar(scale).add(translation);
      root.scale.multiplyScalar(scale);
    },
    update(camera: THREE.PerspectiveCamera, height: number, pixelRatio: number) {
      const scale = Math.abs(root.scale.x);
      const physicalDistance = camera.position.distanceTo(root.position) / Math.max(0.001, scale);
      const zoom = Math.log2(Math.max(1, physicalDistance / 4));
      uniforms.uWorldScale.value = scale;
      uniforms.uProjectionScale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      uniforms.uPixelRatio.value = pixelRatio;
      uniforms.uDensity.value = THREE.MathUtils.clamp(0.5 + zoom * 0.13, 0.45, 1);
      uniforms.uIntensity.value = THREE.MathUtils.clamp(0.82 + zoom * 0.08, 0.8, 1.2);
    },
    dispose() {
      scene.remove(root);
      geometry.dispose();
      material.dispose();
      root.clear();
    },
  };
}
