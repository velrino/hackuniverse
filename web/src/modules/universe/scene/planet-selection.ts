import * as THREE from "three";

/** A single reusable shell. The globe geometry and particle mask belong to the controller. */
export function createPlanetSelection(sphere: THREE.BufferGeometry, pointMap: THREE.Texture) {
  const root = new THREE.Group();
  root.name = "selected-planet-shell";
  root.visible = false;
  const rimMaterial = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0x42e8f4) }, opacity: { value: 0.28 } },
    vertexShader: `varying vec3 vNormal; varying vec3 vView;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal); vView = -viewPosition.xyz;
        gl_Position = projectionMatrix * viewPosition;
      }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; varying vec3 vNormal; varying vec3 vView;
      void main() {
        float edge = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.5);
        float alpha = edge * opacity;
        if (alpha < 0.005) discard;
        gl_FragColor = vec4(color, alpha);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const rim = new THREE.Mesh(sphere, rimMaterial);
  rim.name = "planet-atmospheric-rim";
  rim.scale.setScalar(1.023);
  root.add(rim);

  const polyhedron = new THREE.IcosahedronGeometry(1, 2);
  const wireGeometry = new THREE.WireframeGeometry(polyhedron);
  polyhedron.dispose();
  const wireMaterial = new THREE.LineBasicMaterial({ color: 0x68eaff, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false });
  const wire = new THREE.LineSegments(wireGeometry, wireMaterial);
  wire.name = "planet-geodesic-shell";
  wire.scale.setScalar(1.045);
  root.add(wire);

  const positions = new Float32Array(8 * 3);
  const point = new THREE.Vector3();
  for (let index = 0; index < 8; index++) {
    point.set(index & 1 ? 1 : -1, index & 2 ? 1 : -1, index & 4 ? 1 : -1).normalize().multiplyScalar(1.046).toArray(positions, index * 3);
  }
  const nodesGeometry = new THREE.BufferGeometry();
  nodesGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const nodesMaterial = new THREE.PointsMaterial({ color: 0xa6f5ff, map: pointMap, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.32, alphaTest: 0.05, depthWrite: false, toneMapped: false });
  const nodes = new THREE.Points(nodesGeometry, nodesMaterial);
  nodes.name = "planet-shell-nodes";
  root.add(nodes);
  let disposed = false;

  return {
    root,
    update(position: THREE.Vector3, radius: number, orientation: THREE.Quaternion, camera: THREE.PerspectiveCamera, height: number) {
      const distance = camera.position.distanceTo(position);
      root.visible = !disposed && Number.isFinite(distance) && radius > 0 && distance > radius * 1.05;
      if (!root.visible) return;
      root.position.copy(position);
      root.scale.setScalar(radius);
      root.quaternion.copy(orientation);
      const pixels = radius * height / (Math.max(distance, 0.001) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      const detail = THREE.MathUtils.smoothstep(pixels, 18, 90);
      wire.visible = detail > 0;
      nodes.visible = pixels > 80;
      wireMaterial.opacity = detail * 0.18;
      rimMaterial.uniforms.opacity.value = 0.18 + detail * 0.1;
    },
    hide() { root.visible = false; },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent(); root.visible = false;
      wireGeometry.dispose(); nodesGeometry.dispose();
      rimMaterial.dispose(); wireMaterial.dispose(); nodesMaterial.dispose();
    },
  };
}
