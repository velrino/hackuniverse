import * as THREE from "three";

export type ScenePickTarget = {
  id: string;
  object: THREE.Object3D;
  position: THREE.Vector3;
  radius: number;
  screenRadius?: () => number;
  visible?: () => boolean;
};

export function isObjectVisible(object: THREE.Object3D): boolean {
  for (let ancestor: THREE.Object3D | null = object; ancestor; ancestor = ancestor.parent) {
    if (!ancestor.visible) return false;
  }
  return true;
}

/** Invisible pick proxies cannot occlude the rendered surfaces behind them. */
export function findPhysicalHit(hits: readonly THREE.Intersection[]): THREE.Intersection | undefined {
  return hits.find((hit) => {
    if (!(hit.object instanceof THREE.Mesh) || !isObjectVisible(hit.object)) return false;
    const materials = Array.isArray(hit.object.material)
      ? hit.face ? [hit.object.material[hit.face.materialIndex]] : []
      : [hit.object.material];
    return materials.some((material) => material?.visible && material.colorWrite && material.opacity > 0 &&
      (!material.transparent || material.opacity >= 1));
  });
}

/** The caller updates world matrices once for the scene, rather than per target. */
export function destinationPosition(target: ScenePickTarget, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(target.position).applyMatrix4(target.object.matrixWorld);
}

/** Pick rendered catalog markers in CSS pixels, without geometry or raycast work. */
export function pickSceneDestination(
  targets: readonly ScenePickTarget[],
  camera: THREE.PerspectiveCamera,
  pointer: THREE.Vector2,
  width: number,
  height: number,
  minimumRadius = 4,
  maxDistance = Infinity,
): ScenePickTarget | null {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0 ||
      !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y) || Math.abs(pointer.x) > 1 || Math.abs(pointer.y) > 1 ||
      !Number.isFinite(minimumRadius) || minimumRadius < 0 || Number.isNaN(maxDistance) || maxDistance < 0) return null;
  camera.updateMatrixWorld();
  const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
  const position = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const projectionScale = camera.projectionMatrix.elements[5] * height / 2;
  const view = camera.matrixWorldInverse.elements;
  let picked: ScenePickTarget | null = null;
  let closestSquared = Infinity;
  let closestDepth = Infinity;
  for (const target of targets) {
    if (!Number.isFinite(target.radius) || target.radius <= 0 || !isObjectVisible(target.object) || target.visible?.() === false) continue;
    destinationPosition(target, position);
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) continue;
    const distance = cameraPosition.distanceTo(position);
    if (!Number.isFinite(distance) || distance > maxDistance) continue;
    projected.copy(position).project(camera);
    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || !Number.isFinite(projected.z) || projected.z < -1 || projected.z > 1) continue;
    let radius: number;
    if (target.screenRadius) radius = target.screenRadius();
    else {
      const matrix = target.object.matrixWorld.elements;
      const scale = Math.max(Math.hypot(matrix[0], matrix[1], matrix[2]), Math.hypot(matrix[4], matrix[5], matrix[6]), Math.hypot(matrix[8], matrix[9], matrix[10]));
      const depth = -(view[2] * position.x + view[6] * position.y + view[10] * position.z + view[14]);
      radius = target.radius * scale * projectionScale / depth;
    }
    if (!Number.isFinite(radius) || radius <= 0) continue;
    const x = (projected.x + 1) * width / 2;
    const y = (1 - projected.y) * height / 2;
    if (x + radius < 0 || x - radius > width || y + radius < 0 || y - radius > height) continue;
    const dx = (projected.x - pointer.x) * width / 2;
    const dy = (projected.y - pointer.y) * height / 2;
    const distanceSquared = dx * dx + dy * dy;
    const hitRadius = Math.max(radius, minimumRadius);
    if (distanceSquared > hitRadius * hitRadius) continue;
    if (distanceSquared < closestSquared - 1e-8 || Math.abs(distanceSquared - closestSquared) <= 1e-8 && distance < closestDepth) {
      picked = target;
      closestSquared = distanceSquared;
      closestDepth = distance;
    }
  }
  return picked;
}
