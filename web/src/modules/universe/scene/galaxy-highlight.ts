import * as THREE from "three";

/** Brighten the galaxy's own core and dust without adding an overlay or geometry. */
export function createGalaxyHighlight(root: THREE.Object3D) {
  const cyan = new THREE.Color(0x42e8f4);
  const materials = new Set<THREE.PointsMaterial | THREE.SpriteMaterial>();
  root.traverse((object) => {
    if (object instanceof THREE.Points || object instanceof THREE.Sprite) {
      const values = Array.isArray(object.material) ? object.material : [object.material];
      values.forEach((material) => {
        if (material instanceof THREE.PointsMaterial || material instanceof THREE.SpriteMaterial) materials.add(material);
      });
    }
  });
  const original = [...materials].map((material) => ({
    material, color: material.color.clone(), opacity: material.opacity,
    size: material instanceof THREE.PointsMaterial ? material.size : null,
  }));
  let highlighted = false;

  return (active: boolean) => {
    if (active === highlighted) return;
    highlighted = active;
    original.forEach(({ material, color, opacity, size }) => {
      material.color.copy(color);
      material.opacity = opacity;
      if (size !== null && material instanceof THREE.PointsMaterial) material.size = size;
      if (active) {
        const particles = material instanceof THREE.PointsMaterial;
        material.color.lerp(cyan, particles ? 0.55 : 0.35).multiplyScalar(particles ? 2 : 1.45);
        material.opacity = Math.min(1, opacity * (particles ? 1.6 : 1.35));
        if (size !== null && particles) material.size = size * 1.5;
      }
    });
  };
}
