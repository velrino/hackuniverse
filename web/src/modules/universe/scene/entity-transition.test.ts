import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { entityHierarchy } from "../domain/hierarchy";
import { createEntityTransition, ENTITY_TRANSITION_DURATION_MS } from "./entity-transition";

test("birth and destruction effects stay bounded, finite and disposable across every scale", () => {
  for (const kind of entityHierarchy) for (const mobile of [false, true]) for (const action of ["create", "delete"] as const) for (const variant of ["burst", "collapse"] as const) {
    const scenario = `${kind}/${mobile ? "mobile" : "desktop"}/${action}/${variant}`;
    const scene = new THREE.Scene();
    const pointMap = new THREE.Texture();
    const glowMap = new THREE.Texture();
    let disposedSharedMaps = 0;
    pointMap.addEventListener("dispose", () => disposedSharedMaps++);
    glowMap.addEventListener("dispose", () => disposedSharedMaps++);
    const visual = createEntityTransition(scene, {
      transition: { token: scenario, action, kind, variant, entityId: "synthetic-object" },
      position: new THREE.Vector3(1, 2, 3), radius: 2, mobile, pointMap, glowMap, pixelRatio: () => 1.5,
    });
    assert.equal(scene.children.length, 1, scenario);
    let draws = 0;
    let ownedDisposals = 0;
    scene.traverse((object) => {
      if (object instanceof THREE.Points || object instanceof THREE.Sprite) {
        draws++;
        object.material.addEventListener("dispose", () => ownedDisposals++);
      }
      if (object instanceof THREE.Points) {
        const positions = object.geometry.getAttribute("position");
        assert.ok(positions.count <= (mobile ? 128 : kind === "universe" ? 320 : 256), scenario);
        object.geometry.addEventListener("dispose", () => ownedDisposals++);
      }
    });
    assert.ok(draws <= 2, scenario);
    for (const elapsed of [0, 100, 500, 1000, ENTITY_TRANSITION_DURATION_MS]) {
      assert.equal(visual.update(elapsed), elapsed === ENTITY_TRANSITION_DURATION_MS, scenario);
      scene.traverse((object) => {
        if (object instanceof THREE.Points) for (const value of object.geometry.getAttribute("position").array) assert.ok(Number.isFinite(value), scenario);
      });
    }
    visual.setPosition(new THREE.Vector3(4, 5, 6));
    assert.deepEqual(scene.children[0].position.toArray(), [4, 5, 6], scenario);
    visual.dispose(); visual.dispose();
    assert.equal(scene.children.length, 0, scenario);
    assert.equal(ownedDisposals, 3, scenario);
    assert.equal(disposedSharedMaps, 0, scenario);
    pointMap.dispose(); glowMap.dispose();
  }
});
