import * as THREE from "three";

type HighlightMaterial = THREE.MeshBasicMaterial | THREE.MeshStandardMaterial | THREE.PointsMaterial | THREE.SpriteMaterial;

/** Brighten existing destination materials without overlays, geometry or shader changes. */
export function createDestinationHighlight(root: THREE.Object3D) {
  const cyan = new THREE.Color(0x42e8f4);
  const materials = new Set<HighlightMaterial>();
  // Capture dormant LOD branches as well; their materials may become visible mid-hover.
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Sprite) {
      const values = Array.isArray(object.material) ? object.material : [object.material];
      values.forEach((material) => {
        if (!material.visible || material.opacity <= 0 || !material.colorWrite) return;
        if (material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshStandardMaterial || material instanceof THREE.PointsMaterial || material instanceof THREE.SpriteMaterial) {
          materials.add(material);
        }
      });
    }
  });
  const original = [...materials].map((material) => ({
    material, color: material.color.clone(), opacity: material.opacity,
    size: material instanceof THREE.PointsMaterial ? material.size : null,
    emissive: material instanceof THREE.MeshStandardMaterial ? material.emissive.clone() : null,
    emissiveIntensity: material instanceof THREE.MeshStandardMaterial ? material.emissiveIntensity : null,
  }));
  let highlighted = false;

  return (active: boolean) => {
    if (active === highlighted) return;
    highlighted = active;
    original.forEach(({ material, color, opacity, size, emissive, emissiveIntensity }) => {
      material.color.copy(color);
      material.opacity = opacity;
      if (size !== null && material instanceof THREE.PointsMaterial) material.size = size;
      if (emissive && emissiveIntensity !== null && material instanceof THREE.MeshStandardMaterial) {
        material.emissive.copy(emissive);
        material.emissiveIntensity = emissiveIntensity;
      }
      if (active) {
        if (material instanceof THREE.MeshStandardMaterial && emissive && emissiveIntensity !== null) {
          // Add a small lighting cue while keeping the mapped surface color intact.
          const intensity = Math.max(0.2, emissiveIntensity);
          material.emissive.multiplyScalar(emissiveIntensity / intensity);
          material.emissive.r += cyan.r * 0.035 / intensity;
          material.emissive.g += cyan.g * 0.035 / intensity;
          material.emissive.b += cyan.b * 0.035 / intensity;
          material.emissiveIntensity = intensity;
        } else if (material instanceof THREE.MeshBasicMaterial) {
          material.color.multiplyScalar(1.18);
          material.opacity = Math.min(1, opacity * 1.15);
        } else {
          const particles = material instanceof THREE.PointsMaterial;
          const coloredParticles = particles && material.vertexColors;
          if (coloredParticles) material.color.multiplyScalar(1.3);
          else material.color.lerp(cyan, particles ? 0.55 : 0.35).multiplyScalar(particles ? 2 : 1.45);
          material.opacity = Math.min(1, opacity * (coloredParticles ? 1.15 : particles ? 1.6 : 1.35));
          if (size !== null && particles) material.size = size * (coloredParticles ? 1.3 : 1.5);
        }
      }
    });
  };
}
