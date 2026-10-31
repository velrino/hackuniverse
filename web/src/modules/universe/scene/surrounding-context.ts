import * as THREE from "three";
import type { SceneNode, UniverseSceneView } from "../domain/types";
import { clusterPosition, clusterScale } from "./layout";
import {
  createGalaxyVisual,
  updateGalaxyVisual, type ClusterVisualResources,
} from "./cluster-visuals";
import { mapAncestorToAnchor, type SceneCoordinateMapping } from "./view-coordinates";

type Candidate = { node: SceneNode; position: THREE.Vector3; distance: number; extent: number };
export type ContextDestination = {
  id: string;
  kind: SceneNode["kind"];
  name: string;
  position: THREE.Vector3;
  extent: number;
  /** Caption visibility, independent of the rendered marker's opacity. */
  opacity: number;
  screenRadius: number;
  highlight: (active: boolean) => void;
};
export type ContextLabel = ContextDestination;

/** Reserve every surrounding scale before spending unused slots on nearby destinations. */
function chooseCandidates(candidates: Candidate[], mobile: boolean) {
  const limits = mobile ? { galaxy: 2, cloud: 4, system: 6 } : { galaxy: 4, cloud: 8, system: 12 };
  const chosen = new Set<Candidate>();
  for (const kind of ["galaxy", "cloud", "system"] as const) {
    for (const candidate of candidates.filter(({ node }) => node.kind === kind).slice(0, limits[kind])) chosen.add(candidate);
  }
  for (const candidate of candidates) {
    if (chosen.size >= (mobile ? 12 : 24)) break;
    chosen.add(candidate);
  }
  return candidates.filter((candidate) => chosen.has(candidate));
}

/** One bounded draw: warm-star orbits, constellation dots and elliptical galaxy arms. */
function addDestinationMarkers(root: THREE.Group, candidates: Candidate[], destinations: ContextDestination[], pixelRatio: () => number) {
  const positions = new Float32Array(candidates.length * 3);
  const kinds = new Float32Array(candidates.length);
  const extents = new Float32Array(candidates.length);
  const indices = new Float32Array(candidates.length);
  candidates.forEach(({ node, position, extent }, index) => {
    position.toArray(positions, index * 3);
    kinds[index] = node.kind === "galaxy" ? 2 : node.kind === "cloud" ? 1 : 0;
    extents[index] = extent;
    indices[index] = index;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("markerKind", new THREE.BufferAttribute(kinds, 1));
  geometry.setAttribute("markerExtent", new THREE.BufferAttribute(extents, 1));
  geometry.setAttribute("markerIndex", new THREE.BufferAttribute(indices, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { viewportHeight: { value: 1 }, pixelRatio: { value: pixelRatio() }, opacity: { value: 0.42 }, hoveredIndex: { value: -1 } },
    vertexShader: `attribute float markerKind; attribute float markerExtent; attribute float markerIndex;
      uniform float viewportHeight; uniform float pixelRatio;
      varying float vKind; varying float vDetail; varying float vIndex;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float scale = length(modelMatrix[0].xyz);
        float pixels = markerExtent * scale * projectionMatrix[1][1] * viewportHeight / max(0.1, -viewPosition.z);
        gl_PointSize = clamp(pixels, 2.0 * pixelRatio, 20.0 * pixelRatio);
        vDetail = smoothstep(4.0, 10.0, pixels / pixelRatio); vKind = markerKind; vIndex = markerIndex;
        gl_Position = projectionMatrix * viewPosition;
      }`,
    fragmentShader: `uniform float opacity; uniform float hoveredIndex;
      varying float vKind; varying float vDetail; varying float vIndex;
      float dotAt(vec2 point, vec2 center, float radius) { return 1.0 - smoothstep(radius * 0.4, radius, length(point - center)); }
      void main() {
        vec2 point = (gl_PointCoord - 0.5) * 2.0;
        float roundPoint = 1.0 - smoothstep(0.15, 0.85, length(point));
        float alpha = 0.0; vec3 color = vec3(0.43, 0.82, 0.93);
        if (vKind < 0.5) {
          float radius = length(point * vec2(1.0, 2.1));
          float orbit = 1.0 - smoothstep(0.035, 0.105, abs(radius - 0.73));
          float core = dotAt(point, vec2(0.0), 0.25);
          alpha = max(orbit * 0.6, core); color = mix(color, vec3(1.0, 0.67, 0.3), core);
        } else if (vKind < 1.5) {
          alpha = max(dotAt(point, vec2(-0.45, 0.18), 0.2), max(dotAt(point, vec2(0.4, 0.25), 0.18), dotAt(point, vec2(0.0, -0.35), 0.22)));
        } else {
          vec2 ellipse = point * vec2(1.0, 1.65); float radius = length(ellipse);
          float arms = pow(0.5 + 0.5 * cos(atan(ellipse.y, ellipse.x) * 2.0 - log(radius + 0.045) * 6.0), 6.0);
          alpha = max(dotAt(ellipse, vec2(0.0), 0.28), arms * (1.0 - smoothstep(0.2, 0.95, radius)) * 0.85);
        }
        float highlighted = 1.0 - step(0.5, abs(vIndex - hoveredIndex));
        alpha = mix(roundPoint, alpha, vDetail) * opacity * mix(1.0, 1.6, highlighted);
        color *= mix(1.0, 1.45, highlighted);
        if (alpha < 0.012) discard;
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  material.opacity = 0.42;
  let disposed = false;
  material.addEventListener("dispose", () => {
    disposed = true;
    material.uniforms.hoveredIndex.value = -1;
  });
  destinations.forEach((destination, index) => {
    destination.highlight = (active) => {
      if (disposed) return;
      if (active) material.uniforms.hoveredIndex.value = index;
      else if (material.uniforms.hoveredIndex.value === index) material.uniforms.hoveredIndex.value = -1;
    };
  });
  const points = new THREE.Points(geometry, material);
  points.name = "surrounding-destinations";
  // Shader uniforms follow the same material opacity used by hierarchy crossfades.
  points.onBeforeRender = () => { material.uniforms.opacity.value = material.opacity; };
  root.add(points);
  return (height: number) => {
    const ratio = pixelRatio();
    material.uniforms.viewportHeight.value = height * ratio;
    material.uniforms.pixelRatio.value = ratio;
  };
}

function mappedGroup(parent: THREE.Group, name: string, mapping: SceneCoordinateMapping) {
  const group = new THREE.Group();
  group.name = name;
  group.position.copy(mapping.offset);
  group.scale.setScalar(mapping.scale);
  parent.add(group);
  return group;
}

function contextRadius(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) return 0;
  let radius = new THREE.Vector3(
    Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
    Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y)),
    Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)),
  ).length();
  const center = new THREE.Vector3();
  const scale = new THREE.Vector3();
  root.traverse((object) => {
    if (!(object instanceof THREE.Sprite)) return;
    object.getWorldPosition(center);
    object.getWorldScale(scale);
    // Sprites turn toward the camera; enclose every billboard orientation.
    radius = Math.max(radius, center.length() + Math.max(scale.x, scale.y) * Math.SQRT1_2);
  });
  return Number.isFinite(radius) ? radius * 1.03 : 0;
}

/** Bounded catalog destinations; its caller owns geometry/material disposal and shared maps. */
export function createSurroundingContext(
  view: UniverseSceneView,
  resources: ClusterVisualResources,
  { mobile, elapsed }: { mobile: boolean; elapsed: number },
) {
  const root = new THREE.Group();
  root.name = "surrounding-context";
  const updates: ((elapsed: number) => void)[] = [];
  const labels: ContextLabel[] = [];
  const destinations: ContextDestination[] = [];
  let updateMarkers: ((height: number) => void) | undefined;
  const worldPosition = new THREE.Vector3();
  const worldScale = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();
  const update = (time: number, camera: THREE.PerspectiveCamera, height: number) => {
    for (const animate of updates) animate(time);
    updateMarkers?.(height);
    root.getWorldScale(worldScale);
    for (const destination of destinations) {
      worldPosition.copy(destination.position).applyMatrix4(root.matrixWorld);
      const pixels = destination.extent * worldScale.x * height / (Math.max(camera.position.distanceTo(worldPosition), 0.001) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      destination.opacity = THREE.MathUtils.smoothstep(pixels, 4, 10) * 0.48;
      cameraPosition.copy(worldPosition).applyMatrix4(camera.matrixWorldInverse);
      const markerPixels = destination.extent * worldScale.x * camera.projectionMatrix.elements[5] * height / Math.max(0.1, -cameraPosition.z);
      destination.screenRadius = THREE.MathUtils.clamp(markerPixels, 2, 20) / 2;
    }
  };
  const anchor = view.anchor;
  if (!anchor) return { root, update, labels, destinations, radius: 0 };

  const chain = [...(view.ancestors ?? []), anchor];
  const mappings = chain.map((_, index) => mapAncestorToAnchor(chain, index));
  const galaxyIndex = chain.findLastIndex((node) => node.kind === "galaxy");

  if (galaxyIndex >= 0 && mappings[galaxyIndex]) {
    const node = chain[galaxyIndex];
    const mapping = mappings[galaxyIndex]!;
    const group = mappedGroup(root, "galaxy-context", mapping);
    const extent = clusterScale(node.children ?? []).radius;
    const visual = createGalaxyVisual(group, node.seed, extent, resources, elapsed);
    // PointsMaterial does not inherit an Object3D's scale for particle size.
    if (visual.dust.material instanceof THREE.PointsMaterial) visual.dust.material.size *= mapping.scale;
    // Grouping glows give way to the actual contents at deeper zoom levels.
    visual.core.visible = anchor.kind === "galaxy";
    updates.push((time) => updateGalaxyVisual(visual, node.seed, extent, time));
  }

  const candidates: Candidate[] = [];
  for (let index = 0; index < chain.length - 1; index++) {
    const mapping = mappings[index];
    if (!mapping) continue;
    const children = chain[index].children ?? [];
    const branchId = chain[index + 1].id;
    const layout = clusterScale(children);
    children.forEach((node, childIndex) => {
      if (node.id === branchId) return;
      const position = new THREE.Vector3(...clusterPosition(node, childIndex, children.length, layout.radius));
      position.multiplyScalar(mapping.scale).add(mapping.offset);
      if (node.kind === "galaxy" || node.kind === "cloud" || node.kind === "system") {
        candidates.push({ node, position, distance: position.lengthSq(), extent: layout.marker * mapping.scale });
      }
    });
  }
  candidates.sort((a, b) => a.distance - b.distance || (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0));
  const nearest = chooseCandidates(candidates, mobile);
  if (nearest.length) {
    const ratio = resources.pixelRatio;
    nearest.forEach(({ node, position, extent }) => destinations.push({
      id: node.id, kind: node.kind, name: node.name, position, extent,
      opacity: 0, screenRadius: 1, highlight: () => {},
    }));
    updateMarkers = addDestinationMarkers(root, nearest, destinations, typeof ratio === "function" ? ratio : () => ratio);
    const named = new Set<Candidate>();
    // Keep the wider context identifiable even when nearby systems dominate the count.
    for (const kind of ["system", "galaxy", "cloud"]) {
      const candidate = nearest.find(({ node }) => node.kind === kind);
      if (candidate && named.size < (mobile ? 2 : 4)) named.add(candidate);
    }
    for (const candidate of nearest) {
      if (named.size >= (mobile ? 2 : 4)) break;
      named.add(candidate);
    }
    for (const candidate of named) labels.push(destinations[nearest.indexOf(candidate)]);
  }
  return { root, update, labels, destinations, radius: contextRadius(root) };
}
