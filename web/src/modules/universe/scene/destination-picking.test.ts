import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { destinationPosition, findPhysicalHit, isObjectVisible, pickSceneDestination, type ScenePickTarget } from "./destination-picking";

const width = 800;
const height = 600;
const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
const center = new THREE.Vector2();
const pointerAt = (x: number, y: number) => new THREE.Vector2(x * 2 / width, -y * 2 / height);

function target(id: string, x = 0, y = 0, z = 0, screenRadius: number | null = 2): ScenePickTarget {
  const object = new THREE.Group();
  object.position.set(x, y, z);
  object.updateMatrixWorld();
  return { id, object, position: new THREE.Vector3(), radius: 0.1, ...(screenRadius === null ? {} : { screenRadius: () => screenRadius }) };
}

test("destination positions include nested transforms without modifying authored coordinates", () => {
  const parent = new THREE.Group();
  parent.position.set(2, 3, 4);
  parent.scale.set(2, 3, 4);
  const destination = target("nested");
  destination.position.set(1, -2, 3);
  parent.add(destination.object);
  parent.updateMatrixWorld(true);
  const out = new THREE.Vector3();
  assert.equal(destinationPosition(destination, out), out);
  assert.deepEqual(out.toArray(), [4, -3, 16]);
  assert.deepEqual(destination.position.toArray(), [1, -2, 3]);
});

test("CSS marker tolerance is independent of device pixel ratio and expands for touch", () => {
  const marker = target("point");
  for (const simulatedDpr of [1, 1.5, 2, 3]) {
    // Inputs are CSS dimensions: the renderer's backing-store ratio is irrelevant.
    assert.equal(pickSceneDestination([marker], camera, pointerAt(3.9, 0), width, height)?.id, marker.id, `DPR ${simulatedDpr}`);
    assert.equal(pickSceneDestination([marker], camera, pointerAt(4.1, 0), width, height), null);
  }
  assert.equal(pickSceneDestination([marker], camera, pointerAt(21.9, 0), width, height, 22), marker);
  assert.equal(pickSceneDestination([marker], camera, pointerAt(22.1, 0), width, height, 22), null);
});

test("physical marker radii follow world scale and the perspective projection", () => {
  const marker = target("physical", 0, 0, 0, null);
  marker.radius = 0.1;
  assert.equal(pickSceneDestination([marker], camera, pointerAt(8, 0), width, height, 0), null);
  marker.object.scale.setScalar(2);
  marker.object.updateMatrixWorld();
  assert.equal(pickSceneDestination([marker], camera, pointerAt(8, 0), width, height, 0), marker);
  assert.equal(pickSceneDestination([marker], camera, pointerAt(11, 0), width, height, 0), null);
});

test("hidden ancestor and LOD predicates exclude targets despite visible child flags", () => {
  const ancestor = new THREE.Group();
  const marker = target("hidden");
  ancestor.add(marker.object);
  ancestor.updateMatrixWorld(true);
  assert.equal(isObjectVisible(marker.object), true);
  ancestor.visible = false;
  assert.equal(isObjectVisible(marker.object), false);
  assert.equal(pickSceneDestination([marker], camera, center, width, height), null);
  ancestor.visible = true;
  marker.visible = () => false;
  assert.equal(pickSceneDestination([marker], camera, center, width, height), null);
  marker.visible = () => true;
  assert.equal(pickSceneDestination([marker], camera, center, width, height), marker);
  marker.object.visible = false;
  assert.equal(pickSceneDestination([marker], camera, center, width, height), null);
});

test("offscreen, behind-camera and out-of-range markers cannot intercept input", () => {
  for (const marker of [target("outside", 1000), target("behind", 0, 0, 20), target("far", 0, 0, -2000), target("near", 0, 0, 9.99)]) {
    assert.equal(pickSceneDestination([marker], camera, center, width, height), null, marker.id);
  }
  assert.equal(pickSceneDestination([target("inside")], camera, new THREE.Vector2(1.01, 0), width, height), null);
});

test("a foreground mesh depth excludes markers hidden behind the existing hit", () => {
  const marker = target("point");
  assert.equal(pickSceneDestination([marker], camera, center, width, height, 4, 9), null);
  assert.equal(pickSceneDestination([marker], camera, center, width, height, 4, 10), marker);
  assert.equal(pickSceneDestination([marker], camera, center, width, height, 4, 11), marker);
});

test("an oversized invisible parent proxy does not mask a rendered star or miniature planet", () => {
  const geometry = new THREE.SphereGeometry(1, 16, 12);
  const proxyMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, opacity: 0 });
  const physicalMaterial = new THREE.MeshBasicMaterial();
  const proxy = new THREE.Mesh(geometry, proxyMaterial);
  proxy.scale.setScalar(3);
  const star = new THREE.Mesh(geometry, physicalMaterial);
  const planet = new THREE.Mesh(geometry, physicalMaterial);
  planet.position.z = 1;
  planet.scale.setScalar(0.25);
  const planetLod = new THREE.Group();
  planetLod.add(planet);
  const scene = new THREE.Scene();
  scene.add(proxy, star, planetLod);
  scene.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(center, camera);

  for (const showPlanet of [false, true]) {
    planetLod.visible = showPlanet;
    const hits = raycaster.intersectObjects([proxy, star, planet], false);
    assert.equal(hits[0].object, proxy, "the existing larger core proxy intersects the ray first");
    const physical = findPhysicalHit(hits);
    assert.equal(physical?.object, showPlanet ? planet : star, "physical selection skips the invisible proxy and hidden preview LOD");
    const background = target("background-point", 0, 0, -4);
    assert.equal(pickSceneDestination([background], camera, center, width, height, 4, physical!.distance), null,
      "a point behind the rendered surface cannot win screen-center picking");
    const foreground = target("foreground-point", 0, 0, 2);
    assert.equal(pickSceneDestination([background, foreground], camera, center, width, height, 4, physical!.distance), foreground,
      "the invisible proxy does not occlude a point in front of the physical surface");
  }

  planetLod.visible = false;
  star.visible = false;
  const proxyOnly = raycaster.intersectObjects([proxy, star, planet], false);
  assert.ok(proxyOnly.some(({ object }) => object === proxy));
  assert.equal(findPhysicalHit(proxyOnly), undefined, "the controller can retain proxy fallback when no rendered surface was hit");
  geometry.dispose(); proxyMaterial.dispose(); physicalMaterial.dispose();
});

test("nonrendering and translucent foreground materials do not become opaque occluders", () => {
  const geometry = new THREE.SphereGeometry(0.2, 12, 8);
  const variants = [
    new THREE.MeshBasicMaterial({ colorWrite: false }),
    new THREE.MeshBasicMaterial({ visible: false }),
    new THREE.MeshBasicMaterial({ opacity: 0 }),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4 }),
  ];
  const actualMaterial = new THREE.MeshBasicMaterial();
  const actual = new THREE.Mesh(geometry, actualMaterial);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(center, camera);
  for (const material of variants) {
    const foreground = new THREE.Mesh(geometry, material);
    foreground.position.z = 4;
    foreground.updateMatrixWorld();
    actual.updateMatrixWorld();
    const hits = raycaster.intersectObjects([foreground, actual], false);
    assert.ok(hits.some(({ object }) => object === foreground));
    assert.equal(findPhysicalHit(hits)?.object, actual);
  }
  const hiddenAncestor = new THREE.Group();
  const hidden = new THREE.Mesh(geometry, actualMaterial);
  hidden.position.z = 4;
  hiddenAncestor.add(hidden);
  hiddenAncestor.visible = false;
  hiddenAncestor.updateMatrixWorld(true);
  assert.equal(findPhysicalHit(raycaster.intersectObjects([hidden, actual], false))?.object, actual);
  geometry.dispose(); actualMaterial.dispose(); variants.forEach((material) => material.dispose());
});

test("physical hits use the intersected face material rather than another visible material", () => {
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const materials = Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial());
  const box = new THREE.Mesh(geometry, materials);
  box.updateMatrixWorld();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(center, camera);
  const hits = raycaster.intersectObject(box, false);
  assert.ok(hits.length > 0 && hits[0].face);
  const faceMaterial = materials[hits[0].face.materialIndex];
  faceMaterial.opacity = 0;
  assert.equal(findPhysicalHit(hits), undefined, "opaque materials on unrelated faces do not make this face visible");
  faceMaterial.opacity = 1;
  assert.equal(findPhysicalHit(hits), hits[0]);
  geometry.dispose(); materials.forEach((material) => material.dispose());
});

test("overlapping marker tolerances choose the closest screen center, then nearer depth", () => {
  const shifted = target("shifted", 0.03);
  const centeredFar = target("far", 0, 0, -5);
  const centeredNear = target("near", 0, 0, 2);
  assert.equal(pickSceneDestination([shifted, centeredFar], camera, center, width, height), centeredFar);
  assert.equal(pickSceneDestination([centeredFar, centeredNear], camera, center, width, height), centeredNear);
  assert.equal(pickSceneDestination([centeredNear, centeredFar], camera, center, width, height), centeredNear);
});

test("invalid marker values and viewport inputs fail closed without poisoning later picks", () => {
  const marker = target("valid");
  for (const radius of [0, -1, NaN, Infinity]) {
    assert.equal(pickSceneDestination([{ ...marker, radius }], camera, center, width, height), null);
    assert.equal(pickSceneDestination([{ ...marker, screenRadius: () => radius }], camera, center, width, height), null);
  }
  assert.equal(pickSceneDestination([{ ...marker, position: new THREE.Vector3(NaN, 0, 0) }], camera, center, width, height), null);
  for (const value of [0, -1, NaN, Infinity]) {
    assert.equal(pickSceneDestination([marker], camera, center, value, height), null);
    assert.equal(pickSceneDestination([marker], camera, center, width, value), null);
  }
  for (const radius of [-1, NaN, Infinity]) assert.equal(pickSceneDestination([marker], camera, center, width, height, radius), null);
  for (const limit of [-1, NaN]) assert.equal(pickSceneDestination([marker], camera, center, width, height, 4, limit), null);
  assert.equal(pickSceneDestination([marker], camera, new THREE.Vector2(NaN, 0), width, height), null);
  assert.equal(pickSceneDestination([marker], camera, center, width, height), marker);
});
