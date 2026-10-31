import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createPlanetSelection } from "./planet-selection";
import { createOrbitGuides, ORBIT_GUIDE_LIMIT } from "./orbit-guides";
import { createPlanetRings } from "./planet-rings";
import { createDestinationHighlight } from "./destination-highlight";
import { createSurroundingContext } from "./surrounding-context";
import { clusterPosition, clusterScale, previewScale } from "./layout";
import type { SceneNode, UniverseSceneView } from "../domain/types";

const near = (actual: number, expected: number, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} differs from ${expected}`);

test("selected-planet presentation stays tight to the globe and disappears inside its surface", () => {
  const sphere = new THREE.SphereGeometry(1, 16, 12);
  const map = new THREE.Texture();
  const visual = createPlanetSelection(sphere, map);
  const camera = new THREE.PerspectiveCamera(46, 1.5, 0.1, 10_000);
  const position = new THREE.Vector3(3, 4, 5);
  const orientation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.7);
  assert.equal(visual.root.visible, false);
  camera.position.copy(position).add(new THREE.Vector3(0, 0, 20));
  visual.update(position, 2, orientation, camera, 800);
  assert.equal(visual.root.visible, true);
  assert.deepEqual(visual.root.position.toArray(), position.toArray());
  assert.deepEqual(visual.root.quaternion.toArray(), orientation.toArray());
  assert.deepEqual(visual.root.scale.toArray(), [2, 2, 2]);
  const rim = visual.root.getObjectByName("planet-atmospheric-rim");
  const wire = visual.root.getObjectByName("planet-geodesic-shell");
  assert.ok(rim instanceof THREE.Mesh && wire instanceof THREE.LineSegments);
  assert.equal(rim.geometry, sphere);
  near(rim.scale.x, 1.023); near(wire.scale.x, 1.045);
  for (const distance of [0, 1.9, 2, 2.1]) {
    camera.position.copy(position).add(new THREE.Vector3(0, 0, distance));
    visual.update(position, 2, orientation, camera, 800);
    assert.equal(visual.root.visible, false, `distance=${distance}`);
  }
  camera.position.copy(position).add(new THREE.Vector3(0, 0, 2.11));
  visual.update(position, 2, orientation, camera, 800);
  assert.equal(visual.root.visible, true);
  for (const radius of [0, -1, NaN, Infinity]) {
    visual.update(position, radius, orientation, camera, 800);
    assert.equal(visual.root.visible, false, `radius=${radius}`);
  }
  visual.dispose(); sphere.dispose(); map.dispose();
});

test("selection details follow projected size without growing resources or disposing shared assets", () => {
  const sphere = new THREE.SphereGeometry(1, 16, 12);
  const map = new THREE.Texture();
  let sharedDisposals = 0;
  sphere.addEventListener("dispose", () => sharedDisposals++);
  map.addEventListener("dispose", () => sharedDisposals++);
  const scene = new THREE.Scene();
  const visual = createPlanetSelection(sphere, map);
  scene.add(visual.root);
  const owned = new Set<THREE.Material | THREE.BufferGeometry>();
  let draws = 0;
  visual.root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.LineSegments) {
      draws++;
      assert.ok(!Array.isArray(object.material));
      owned.add(object.material);
      if (object.geometry !== sphere) owned.add(object.geometry);
      for (const value of object.geometry.getAttribute("position").array) assert.ok(Number.isFinite(value));
      if (object instanceof THREE.Points) {
        assert.ok(object.geometry.getAttribute("position").count <= 8);
        assert.equal(object.material.map, map);
      }
      if (object instanceof THREE.LineSegments) assert.ok(object.geometry.getAttribute("position").count <= 2000);
    }
  });
  assert.ok(draws <= 3);
  let ownedDisposals = 0;
  owned.forEach((resource) => resource.addEventListener("dispose", () => ownedDisposals++));
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 10_000);
  const center = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  const wire = visual.root.getObjectByName("planet-geodesic-shell") as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  const nodes = visual.root.getObjectByName("planet-shell-nodes") as THREE.Points;
  camera.position.set(0, 0, 10);
  visual.update(center, 1, orientation, camera, 800);
  assert.equal(wire.visible, true); assert.equal(nodes.visible, true);
  assert.ok(wire.material.opacity > 0 && wire.material.opacity <= 0.18);
  camera.position.set(0, 0, 1000);
  visual.update(center, 1, orientation, camera, 800);
  assert.equal(visual.root.visible, true);
  assert.equal(wire.visible, false); assert.equal(nodes.visible, false);
  const children = [...visual.root.children];
  for (let index = 0; index < 200; index++) visual.update(center, 1, orientation, camera, 800);
  assert.deepEqual(visual.root.children, children);
  visual.hide(); assert.equal(visual.root.visible, false);
  visual.dispose(); visual.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(ownedDisposals, owned.size);
  assert.equal(sharedDisposals, 0);
  visual.update(center, 1, orientation, camera, 800);
  assert.equal(visual.root.visible, false);
  sphere.dispose(); map.dispose();
  assert.equal(sharedDisposals, 2);
});

test("orbit guides reject invalid radii and retain inner/outer paths within two bounded draws", () => {
  const input = Object.freeze([NaN, 0, -4, Infinity, ...Array.from({ length: 200 }, (_, index) => index + 1)]);
  const guides = createOrbitGuides(input);
  assert.equal(guides.count, ORBIT_GUIDE_LIMIT);
  assert.ok(guides.root.children.length <= 2);
  const paths = guides.root.getObjectByName("orbit-paths") as THREE.LineSegments;
  const accents = guides.root.getObjectByName("orbit-path-accents") as THREE.LineSegments;
  assert.ok(paths instanceof THREE.LineSegments && accents instanceof THREE.LineSegments);
  const positions = paths.geometry.getAttribute("position");
  assert.ok(positions.count <= ORBIT_GUIDE_LIMIT * 160 * 2);
  assert.ok(accents.geometry.getAttribute("position").count <= ORBIT_GUIDE_LIMIT * 12 * 2);
  const radii: number[] = [];
  for (let index = 0; index < positions.count; index++) {
    assert.ok(Number.isFinite(positions.getX(index)) && Number.isFinite(positions.getY(index)) && Number.isFinite(positions.getZ(index)));
    assert.equal(positions.getY(index), 0);
    if (index % 320 === 0) radii.push(Math.hypot(positions.getX(index), positions.getZ(index)));
  }
  assert.deepEqual(radii.slice(0, 8), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(radii.at(-1), 200);
  assert.equal(new Set(radii).size, ORBIT_GUIDE_LIMIT);
  guides.dispose();
  for (const values of [[], [NaN, Infinity, 0, -1]]) {
    const empty = createOrbitGuides(values);
    assert.equal(empty.count, 0); assert.equal(empty.root.children.length, 0);
    empty.dispose();
  }
});

test("orbit path emphasis follows projected distance and owned resources dispose once", () => {
  const scene = new THREE.Scene();
  const guides = createOrbitGuides([10, 20, 30]);
  scene.add(guides.root);
  let disposed = 0;
  guides.root.children.forEach((object) => {
    assert.ok(object instanceof THREE.LineSegments);
    object.geometry.addEventListener("dispose", () => disposed++);
    assert.ok(object.material instanceof THREE.LineBasicMaterial);
    object.material.addEventListener("dispose", () => disposed++);
  });
  const paths = guides.root.getObjectByName("orbit-paths") as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  const accents = guides.root.getObjectByName("orbit-path-accents") as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100_000);
  camera.position.set(0, 0, 100); guides.update(camera, 800);
  const close = [paths.material.opacity, accents.material.opacity];
  camera.position.set(0, 0, 10_000); guides.update(camera, 800);
  assert.ok(paths.material.opacity > 0 && paths.material.opacity < close[0]);
  assert.ok(accents.material.opacity > 0 && accents.material.opacity < close[1]);
  assert.ok(paths.material.opacity <= 0.2 && accents.material.opacity <= 0.14);
  guides.dispose(); guides.dispose();
  assert.equal(disposed, 4); assert.equal(scene.children.length, 0);
});

test("planet ring bands remain an ordinary hover/fade material without allocating textures", () => {
  const ring = createPlanetRings(2, { color: "#c5a7ff", inner: 1.3, outer: 2, opacity: 0.4 });
  assert.ok(ring.material instanceof THREE.MeshBasicMaterial);
  assert.equal(ring.material.map, null);
  assert.equal(ring.material.transparent, true);
  assert.equal(ring.material.depthWrite, false);
  const parameters = ring.geometry.parameters;
  near(parameters.innerRadius, 2.6); near(parameters.outerRadius, 4);
  const shader = { uniforms: {}, vertexShader: "#include <begin_vertex>", fragmentShader: "#include <color_fragment>" } as Parameters<THREE.MeshBasicMaterial["onBeforeCompile"]>[0];
  ring.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  near(shader.uniforms.ringInner.value as number, 2.6);
  near(shader.uniforms.ringWidth.value as number, 1.4);
  assert.ok(shader.vertexShader.includes("vRingPosition = position.xy"));
  assert.ok(shader.fragmentShader.includes("diffuseColor.a *= fineBands * broadBands * gap * edge"));
  assert.equal(Object.values(shader.uniforms).some((uniform) => uniform.value instanceof THREE.Texture), false);
  const root = new THREE.Group(); root.add(ring);
  const highlight = createDestinationHighlight(root);
  const color = ring.material.color.clone();
  highlight(true); assert.ok(ring.material.opacity > 0.4);
  highlight(false); near(ring.material.opacity, 0.4);
  assert.deepEqual(ring.material.color.toArray(), color.toArray());
  ring.material.opacity = 0.1;
  near(ring.material.opacity, 0.1);
  ring.geometry.dispose(); ring.material.dispose();
});

function contextFixture() {
  let seed = 100;
  const node = (kind: SceneNode["kind"], id: string, children?: SceneNode[]): SceneNode => ({ id, kind, name: id, subtitle: "", count: children?.length ?? 0, seed: seed++, color: "#54ccdf", ...(children ? { children } : {}) });
  const planets = Array.from({ length: 8 }, (_, index) => node("planet", `planet-${index}`));
  const systems = Array.from({ length: 41 }, (_, index) => node("system", `system-${index}`, index === 0 ? planets : []));
  const clouds = Array.from({ length: 20 }, (_, index) => node("cloud", `cloud-${index}`, index === 0 ? systems : []));
  const galaxies = Array.from({ length: 10 }, (_, index) => node("galaxy", `galaxy-${index}`, index === 0 ? clouds : []));
  const universe = node("universe", "universe", galaxies);
  const active = [universe, galaxies[0], clouds[0], systems[0]];
  const view: UniverseSceneView = { key: "system:system-0", mode: "system", nodes: planets, anchor: systems[0], ancestors: active.slice(0, -1) };
  const candidates: { node: SceneNode; position: THREE.Vector3 }[] = [];
  // Apply the public nested-preview coordinate contract successively to each sibling.
  for (let level = 0; level < active.length - 1; level++) {
    const parent = active[level];
    const siblings = parent.children!;
    for (let index = 0; index < siblings.length; index++) {
      const sibling = siblings[index];
      if (sibling.id === active[level + 1].id) continue;
      const position = new THREE.Vector3(...clusterPosition(sibling, index, siblings.length, clusterScale(siblings).radius));
      for (let descendant = level; descendant < active.length - 1; descendant++) {
        const children = active[descendant].children!;
        const current = active[descendant + 1];
        const layout = clusterScale(children);
        const center = new THREE.Vector3(...clusterPosition(current, children.indexOf(current), children.length, layout.radius));
        position.sub(center).divideScalar(previewScale(current, layout.marker));
      }
      candidates.push({ node: sibling, position });
    }
  }
  return { view, candidates, active };
}

test("distant context maps every bounded catalog marker to a selectable destination while limiting captions", () => {
  const { view, candidates, active } = contextFixture();
  const shared = [new THREE.Texture(), new THREE.Texture(), new THREE.Texture()];
  let sharedDisposals = 0;
  shared.forEach((texture) => texture.addEventListener("dispose", () => sharedDisposals++));
  for (const mobile of [true, false]) {
    const visual = createSurroundingContext(view, { glowMap: shared[0], coronaMap: shared[1], galaxyPointMap: shared[2], pixelRatio: () => 1.5 }, { mobile, elapsed: 0 });
    const markers = visual.root.getObjectByName("surrounding-destinations");
    assert.ok(markers instanceof THREE.Points && markers.material instanceof THREE.ShaderMaterial);
    const positions = markers.geometry.getAttribute("position");
    const kinds = markers.geometry.getAttribute("markerKind");
    const extents = markers.geometry.getAttribute("markerExtent");
    const indices = markers.geometry.getAttribute("markerIndex");
    assert.equal(positions.count, mobile ? 12 : 24);
    assert.equal(visual.destinations.length, positions.count, "every rendered catalog marker retains a destination, including markers without captions");
    assert.equal(new Set(visual.destinations.map(({ id }) => id)).size, positions.count);
    const counts = [0, 0, 0];
    for (let index = 0; index < positions.count; index++) {
      const kind = kinds.getX(index);
      assert.ok(kind === 0 || kind === 1 || kind === 2);
      counts[kind]++;
      const position = new THREE.Vector3().fromBufferAttribute(positions, index);
      assert.ok(Number.isFinite(position.length()) && Number.isFinite(extents.getX(index)) && extents.getX(index) > 0);
      const source = candidates.find((candidate) => position.distanceTo(candidate.position) <= Math.max(0.005, position.length() * 1e-6));
      assert.ok(source, "every marker retains the real sibling's transformed coordinates");
      assert.equal(kind, source.node.kind === "galaxy" ? 2 : source.node.kind === "cloud" ? 1 : 0);
      assert.equal(active.some((branch) => branch.id === source.node.id), false);
      const destination = visual.destinations[index];
      assert.equal(indices.getX(index), index);
      assert.equal(destination.id, source.node.id);
      assert.equal(destination.kind, source.node.kind);
      assert.equal(destination.name, source.node.name);
      assert.ok(destination.position.distanceTo(source.position) < 1e-6);
      near(destination.extent, extents.getX(index), Math.max(1e-6, destination.extent * 1e-6));
    }
    assert.deepEqual(counts, mobile ? [6, 4, 2] : [12, 8, 4]);
    assert.ok(visual.labels.length > 0 && visual.labels.length <= (mobile ? 2 : 4));
    for (const label of visual.labels) {
      assert.ok(visual.destinations.includes(label), "captions reference the same selectable destination state");
      const source = candidates.find(({ node }) => node.id === label.id);
      assert.ok(source);
      assert.equal(label.name, source.node.name);
      assert.ok(label.position.distanceTo(source.position) < 1e-6);
      assert.equal(active.some((branch) => branch.id === label.id), false);
    }
    const owned = new Set<THREE.Material | THREE.BufferGeometry>();
    visual.root.traverse((object) => {
      assert.equal(object.userData.id, undefined, "batched catalog markers retain identity through their destination mapping rather than decorative particles");
      assert.equal(object instanceof THREE.Mesh, false, "context does not create physical planet bodies");
      if (object instanceof THREE.Points) { owned.add(object.geometry); owned.add(object.material as THREE.Material); }
      if (object instanceof THREE.Sprite) owned.add(object.material);
    });
    assert.ok(owned.size <= 5);
    const core = visual.root.getObjectByName("galaxy-context")?.children.find((object) => object instanceof THREE.Sprite);
    assert.ok(core); assert.equal(core.visible, false, "a deeper system view does not restore the white galactic core");
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100_000);
    camera.position.set(0, 0, 200);
    camera.updateMatrixWorld(true);
    visual.update(2, camera, 800);
    for (const label of visual.labels) assert.ok(label.opacity >= 0 && label.opacity <= 0.48);
    for (const destination of visual.destinations) {
      const inCamera = destination.position.clone().applyMatrix4(visual.root.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      const pixels = destination.extent * camera.projectionMatrix.elements[5] * 800 / Math.max(0.1, -inCamera.z);
      near(destination.screenRadius, THREE.MathUtils.clamp(pixels, 2, 20) / 2);
      assert.ok(destination.screenRadius >= 1 && destination.screenRadius <= 10);
    }
    assert.equal(markers.material.uniforms.viewportHeight.value, 1200);
    assert.equal(markers.material.uniforms.pixelRatio.value, 1.5);
    // This is the material opacity that the existing hierarchy crossfade owns.
    markers.material.opacity = 0.13;
    markers.onBeforeRender({} as THREE.WebGLRenderer, new THREE.Scene(), camera, markers.geometry, markers.material, new THREE.Group());
    near(markers.material.uniforms.opacity.value as number, 0.13);
    const geometry = markers.geometry;
    assert.equal(markers.material.uniforms.hoveredIndex.value, -1);
    visual.destinations[0].highlight(true);
    assert.equal(markers.material.uniforms.hoveredIndex.value, 0);
    visual.destinations[1].highlight(true);
    visual.destinations[0].highlight(false);
    assert.equal(markers.material.uniforms.hoveredIndex.value, 1, "leaving an older destination cannot clear a newer marker highlight");
    visual.destinations[1].highlight(false);
    assert.equal(markers.material.uniforms.hoveredIndex.value, -1);
    assert.equal(markers.geometry, geometry, "hover reuses the existing batched geometry");
    visual.destinations[0].highlight(true);
    assert.ok(Number.isFinite(visual.radius) && visual.radius > 0);
    owned.forEach((resource) => resource.dispose()); visual.root.clear();
    assert.equal(markers.material.uniforms.hoveredIndex.value, -1, "disposing the owned material releases its marker highlight");
    visual.destinations[0].highlight(true);
    assert.equal(markers.material.uniforms.hoveredIndex.value, -1, "stale callbacks cannot reactivate a disposed marker");
    assert.equal(sharedDisposals, 0, "the caller disposes owned geometry/materials while keeping shared maps");
  }
  shared.forEach((texture) => texture.dispose());
  assert.equal(sharedDisposals, 3);
});

test("an unavailable context anchor returns an empty safe presentation", () => {
  const maps = [new THREE.Texture(), new THREE.Texture(), new THREE.Texture()];
  const visual = createSurroundingContext({ key: "missing", mode: "cluster", nodes: [] }, { glowMap: maps[0], coronaMap: maps[1], galaxyPointMap: maps[2], pixelRatio: 1 }, { mobile: true, elapsed: 0 });
  assert.equal(visual.root.children.length, 0); assert.equal(visual.labels.length, 0); assert.equal(visual.destinations.length, 0); assert.equal(visual.radius, 0);
  visual.update(1, new THREE.PerspectiveCamera(), 800);
  assert.equal(visual.root.children.length, 0);
  maps.forEach((texture) => texture.dispose());
});
