import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { SceneNode, UniverseSceneView } from "../domain/types";
import { glowTexture, planetTexture, seededRandom, starSurfaceTexture, starCoronaTexture, nebulaTexture } from "./textures";
import { createShipPilot, type ShipFlightInput } from "./flight";
import type { UniverseFlightStatus } from "./types";
import { createSemanticZoomGate } from "./semantic-zoom";
import { clusterPosition, clusterScale, nodeGeometrySignature, orbitalAngle, orbitalSpeed, planetRadius, previewScale, systemOrbit, systemRadius } from "./layout";
import { createSpatialBackground } from "./background";

type Callbacks = { onSelect: (id: string) => void; onReady: () => void; onUnavailable: () => void; onFlightStatus: (status: UniverseFlightStatus) => void; onGuideRequest: (id: string) => void; onAutopilotEnd: () => void; onScaleOut: () => void; onScaleIn: (id: string) => void };
type Body = { node: SceneNode; object: THREE.Group; radius: number; extent: number; angle: number; orbit: number; mesh: THREE.Mesh; detail?: THREE.Group; proxy?: THREE.Sprite; localOrbits?: THREE.Group; miniPlanets?: { mesh: THREE.Mesh; orbit: number; scale: number; index: number }[] };
type Label = { element: HTMLElement; body?: Body; position?: THREE.Vector3; width: number };
type CameraPose = { position: THREE.Vector3; target: THREE.Vector3 };
type CameraTween = { from: CameraPose; to: CameraPose; started: number; duration: number; fromFraming: number; toFraming: number; onComplete?: () => void };
type FlightMapPose = CameraPose & { framing: number; focusPosition: THREE.Vector3 | null };
type FadeMaterial = { material: THREE.Material; opacity: number; transparent: boolean; depthWrite: boolean };
type WorldTransition = { outgoing: THREE.Group; incomingMaterials: FadeMaterial[]; outgoingMaterials: FadeMaterial[]; from: CameraPose; to: CameraPose; started: number; fromFraming: number; far: number; minDistance: number; maxDistance: number; fromLightPosition: THREE.Vector3; fromIntensity: number; toIntensity: number };

export function createUniverseController(container: HTMLElement, callbacks: Callbacks) {
  if (typeof ResizeObserver === "undefined" || typeof IntersectionObserver === "undefined") throw new Error("Scene observers unavailable");
  const glowMap = glowTexture();
  const starMap = starSurfaceTexture();
  const coronaMap = starCoronaTexture();
  const nebulaMap = nebulaTexture();
  const sharedMaps = new Set<THREE.Texture>([glowMap, starMap, coronaMap, nebulaMap]);
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  } catch (error) {
    sharedMaps.forEach((map) => map.dispose());
    throw error;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x020a10, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  const canvas = renderer.domElement;
  canvas.className = "universe-canvas";
  canvas.setAttribute("role", "img");
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:grab;";
  container.appendChild(canvas);

  const labelLayer = document.createElement("div");
  labelLayer.className = "universe-scene-labels";
  labelLayer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;";
  container.appendChild(labelLayer);
  const guideButton = document.createElement("button");
  guideButton.type = "button";
  guideButton.className = "universe-guide-button hud-button";
  guideButton.hidden = true;
  labelLayer.appendChild(guideButton);
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), new THREE.MeshBasicMaterial({ map: nebulaMap, side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false }));
  sky.renderOrder = -100;
  scene.add(sky);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 1600);
  camera.position.set(8, 25, 45);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.8;
  controls.zoomToCursor = true;
  controls.minDistance = 7;
  controls.maxDistance = 700;
  controls.maxPolarAngle = Math.PI * 0.93;
  controls.update();

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;
  controls.enableDamping = !reducedMotion;
  scene.add(new THREE.AmbientLight(0x8ec5e8, 0.8));
  const sunLight = new THREE.PointLight(0xffd58a, 3.8, 0, 0);
  scene.add(sunLight);
  const fill = new THREE.DirectionalLight(0x82d6ed, 1.4);
  fill.position.set(-30, 40, 20);
  scene.add(fill);
  const sphere = new THREE.SphereGeometry(1, 32, 20);
  let viewGroup = new THREE.Group();
  let orbitGroup = new THREE.Group();
  scene.add(viewGroup, orbitGroup);

  const background = createSpatialBackground(scene, nebulaMap, glowMap);
  const selection = new THREE.Mesh(new THREE.RingGeometry(1, 1.035, 64), new THREE.MeshBasicMaterial({ color: 0x48e9ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  selection.visible = false;
  scene.add(selection);

  let bodies: Body[] = [];
  let labels: Label[] = [];
  let hitTargets: THREE.Object3D[] = [];
  let currentView: UniverseSceneView | null = null;
  let signature = "";
  let selectedId: string | null = null;
  let focusedId: string | null = null;
  let overviewPose: CameraPose | null = null;
  let cameraTween: CameraTween | null = null;
  let worldTransition: WorldTransition | null = null;
  let orbitalTime = 0;
  let focusFraming = 0;
  let flightMapPose: FlightMapPose | null = null;
  let flightPaused = false;
  let flightReady = false;
  let flightTargetId: string | null = null;
  let autopilotTargetId: string | null = null;
  let guideActionLabel = "";
  let guideWidth = 150;
  let flightGeneration = 0;
  const previousFocusPosition = new THREE.Vector3();
  const focusDelta = new THREE.Vector3();
  let playing = true;
  let destroyed = false;
  let unavailable = false;
  let pageVisible = !document.hidden;
  let intersecting = true;
  let width = 1;
  let height = 1;
  let labelInsetTop = 24;
  let labelInsetBottom = 12;
  let sceneRadius = 40;
  let overviewDistance = 50;
  let focusDistance: number | undefined;
  let hasParentView = false;
  let userZoom: { direction: "in" | "out"; at: number; x: number; y: number } | null = null;
  let pinchDistance = 0;
  const touchPoints = new Map<number, { x: number; y: number }>();
  const semanticZoom = createSemanticZoomGate();
  let frame: number | null = null;
  let ready = false;
  let previousTime = performance.now();
  let lastRendered = 0;
  let interactionUntil = 0;
  const projected = new THREE.Vector3();
  const labelPosition = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const activePointers = new Set<number>();
  let pointerStart: { id: number; x: number; y: number; time: number; dragged: boolean } | null = null;

  function disposeObjects(root: THREE.Object3D, keepShared: boolean) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    root.traverse((object) => {
      const drawable = object as THREE.Mesh;
      if (drawable.geometry && (!keepShared || drawable.geometry !== sphere)) geometries.add(drawable.geometry);
      const values = Array.isArray(drawable.material) ? drawable.material : [drawable.material];
      values.filter(Boolean).forEach((material) => {
        materials.add(material);
        const map = (material as THREE.MeshBasicMaterial).map;
        if (map && !sharedMaps.has(map)) textures.add(map);
      });
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
  }

  function fadeMaterials(root: THREE.Object3D): FadeMaterial[] {
    const materials = new Set<THREE.Material>();
    root.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      if (Array.isArray(material)) material.forEach((value) => materials.add(value));
      else if (material) materials.add(material);
    });
    return [...materials].map((material) => {
      const state = { material, opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite };
      material.transparent = true;
      material.depthWrite = false;
      material.needsUpdate = true;
      return state;
    });
  }

  function setFade(materials: FadeMaterial[], opacity: number) {
    materials.forEach((state) => { state.material.opacity = state.opacity * opacity; });
  }

  function finishWorldTransition() {
    const transition = worldTransition;
    if (!transition) return;
    worldTransition = null;
    transition.incomingMaterials.forEach(({ material, opacity, transparent, depthWrite }) => {
      material.opacity = opacity;
      material.transparent = transparent;
      material.depthWrite = depthWrite;
      material.needsUpdate = true;
    });
    scene.remove(transition.outgoing);
    disposeObjects(transition.outgoing, true);
    transition.outgoing.clear();
    const distance = camera.position.distanceTo(controls.target);
    // An interrupted overlap keeps its exact camera pose instead of clamping it.
    controls.minDistance = Math.min(transition.minDistance, distance);
    controls.maxDistance = Math.max(transition.maxDistance, distance);
    camera.far = Math.max(transition.far, controls.maxDistance + sceneRadius * 4);
    camera.updateProjectionMatrix();
    sunLight.position.set(0, 0, 0);
    sunLight.intensity = transition.toIntensity;
    labelLayer.style.opacity = "";
    labelLayer.inert = false;
    controls.enableDamping = !reducedMotion;
  }

  function addGlow(group: THREE.Object3D, scale: number, color: string | number, opacity: number, map = glowMap, toneMapped = true) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped }));
    sprite.scale.set(scale, scale, 1);
    group.add(sprite);
    return sprite;
  }

  function addOrbit(radius: number, center = new THREE.Vector3(), parent: THREE.Group = orbitGroup) {
    const points = Array.from({ length: 97 }, (_, i) => {
      const angle = i / 96 * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius).add(center);
    });
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x38cadf, transparent: true, opacity: 0.23, depthWrite: false }));
    parent.add(line);
  }

  function addLabel(text: string, body?: Body, position?: THREE.Vector3) {
    const element = document.createElement(body ? "button" : "span");
    element.className = "universe-node-label";
    element.textContent = text;
    element.title = text;
    const labelWidth = Math.min(140, Math.max(44, text.length * 6.2 + 14));
    element.style.width = `${labelWidth}px`;
    if (body) {
      (element as HTMLButtonElement).type = "button";
      element.addEventListener("click", () => {
        requestSelection(body.node.id);
      });
    } else element.style.pointerEvents = "none";
    labelLayer.appendChild(element);
    labels.push({ element, body, position, width: labelWidth });
  }

  function addCluster(body: Body) {
    const { node, object, extent } = body;
    const children = node.children ?? [];
    if (node.kind === "system") {
      body.detail = new THREE.Group();
      body.localOrbits = new THREE.Group();
      body.localOrbits.visible = orbitGroup.visible;
      body.detail.add(body.localOrbits);
      const scale = previewScale(node, extent);
      const star = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ map: starMap, color: 0xffffff, toneMapped: false }));
      star.scale.setScalar(3.4 * scale);
      body.mesh = star;
      body.detail.add(star);
      addGlow(body.detail, 3.4 * 8.6 * scale, 0xffffff, 0.75, coronaMap, false);
      body.miniPlanets = [];
      children.filter((child) => child.kind === "planet").forEach((planet, index) => {
        const orbit = systemOrbit(index);
        const angle = orbitalAngle(index, orbitalTime);
        addOrbit(orbit * scale, new THREE.Vector3(), body.localOrbits);
        const dot = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: planet.color, toneMapped: false }));
        dot.scale.setScalar(planetRadius(planet.seed) * scale);
        dot.position.set(Math.cos(angle) * orbit * scale, 0, Math.sin(angle) * orbit * scale);
        body.detail!.add(dot);
        body.miniPlanets!.push({ mesh: dot, orbit, scale, index });
      });
      object.add(body.detail);
      body.proxy = addGlow(object, 5, 0xffffff, 0.9, coronaMap, false);
    } else if (node.kind === "cloud") {
      body.mesh.visible = false;
      const haze = addGlow(object, extent * 2.8, node.color, 0.5);
      haze.scale.y *= 0.55;
      const second = addGlow(object, extent * 1.6, 0x4b71b0, 0.3);
      second.position.set(extent * 0.25, extent * 0.08, -extent * 0.15);
      addStarPoints(object, children.filter((child) => child.kind === "system").map((child, index, systems) => clusterPosition(child, index, systems.length, extent * 1.1)), extent * 0.13);
    } else {
      body.mesh.visible = false;
      const random = seededRandom(node.seed);
      const positions: [number, number, number][] = [];
      for (let index = 0; index < 260; index++) {
        const radius = Math.sqrt(random()) * extent;
        const angle = radius / extent * 5.8 + index % 3 * Math.PI * 2 / 3 + (random() - 0.5) * 0.4;
        positions.push([Math.cos(angle) * radius, (random() - 0.5) * extent * 0.055, Math.sin(angle) * radius]);
      }
      const dust = new THREE.BufferGeometry().setFromPoints(positions.map((position) => new THREE.Vector3(...position)));
      object.add(new THREE.Points(dust, new THREE.PointsMaterial({ color: node.color, size: extent * 0.019, transparent: true, opacity: 0.8, depthWrite: false })));
      const systemPoints: [number, number, number][] = [];
      const galaxyScale = previewScale(node, extent);
      const cloudExtent = clusterScale(children).marker;
      children.forEach((cloud, index) => {
        const origin = clusterPosition(cloud, index, children.length, extent);
        (cloud.children ?? []).filter((child) => child.kind === "system").forEach((system, childIndex, systems) => {
          const local = clusterPosition(system, childIndex, systems.length, cloudExtent * 1.1 * galaxyScale);
          systemPoints.push([origin[0] + local[0], origin[1] + local[1], origin[2] + local[2]]);
        });
      });
      addStarPoints(object, systemPoints, extent * 0.035);
      const core = addGlow(object, extent * 1.3, 0x8eb9df, 0.5);
      core.scale.y *= 0.6;
    }
    const hit = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    hit.scale.setScalar(extent);
    hit.userData.id = node.id;
    object.add(hit);
    hitTargets.push(hit);
  }

  function addStarPoints(parent: THREE.Object3D, points: [number, number, number][], size: number) {
    if (!points.length) return;
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map((position) => new THREE.Vector3(...position)));
    parent.add(new THREE.Points(geometry, new THREE.PointsMaterial({ map: coronaMap, color: 0xffffff, size, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  }

  function fit() {
    cameraTween = null;
    focusFraming = 0;
    controls.enableDamping = !reducedMotion;
    updateFraming();
    const distance = sceneRadius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.15 / Math.min(camera.aspect, 1.5);
    const portrait = camera.aspect < 0.85;
    const cameraDistance = portrait && currentView?.mode !== "planet" ? distance * 0.95 / 1.15 : distance;
    overviewDistance = cameraDistance;
    userZoom = null;
    semanticZoom.reset();
    camera.position.set(...(portrait && currentView?.mode !== "planet" ? [0.12, 0.82, 0.55] : [0.16, 0.5, 0.85]) as [number, number, number]).normalize().multiplyScalar(cameraDistance);
    controls.target.set(0, 0, 0);
    controls.minDistance = currentView?.mode === "planet" ? 8 : 7;
    controls.maxDistance = Math.max(180, distance * 3);
    camera.far = Math.max(1600, cameraDistance * 5 + sceneRadius * 4);
    camera.updateProjectionMatrix();
    controls.update();
    requestRender();
  }

  function updateFraming() {
    camera.clearViewOffset();
    if (focusFraming > 0 && camera.aspect < 0.85) {
      camera.setViewOffset(width, height, 0, height * 0.09 * focusFraming, width, height);
    }
  }

  function pose(): CameraPose {
    return { position: camera.position.clone(), target: controls.target.clone() };
  }

  function beginCameraTween(to: CameraPose, toFraming: number, onComplete?: () => void) {
    finishWorldTransition();
    if (reducedMotion) {
      camera.position.copy(to.position);
      controls.target.copy(to.target);
      focusFraming = toFraming;
      cameraTween = null;
      updateFraming();
      controls.update();
      if (!focusedId) overviewPose = null;
      onComplete?.();
    } else {
      cameraTween = { from: pose(), to, started: performance.now(), duration: 900, fromFraming: focusFraming, toFraming, onComplete };
      controls.enableDamping = false;
    }
    requestRender();
  }

  function focusBody(body: Body) {
    if (!overviewPose) overviewPose = pose();
    focusedId = body.node.id;
    previousFocusPosition.copy(body.object.position);
    const direction = camera.position.clone().sub(controls.target).normalize();
    const distance = body.radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.aspect < 0.85 ? 4.2 : 3);
    focusDistance = distance;
    const target = body.object.position.clone();
    controls.minDistance = body.radius * 2.4;
    beginCameraTween({ position: target.clone().addScaledVector(direction, distance), target }, 1);
  }

  function cancelCameraTween() {
    finishWorldTransition();
    cameraTween = null;
    controls.enableDamping = !reducedMotion;
    if (!focusedId) overviewPose = null;
  }

  function requestSelection(id: string) {
    if (worldTransition) return;
    const body = bodies.find((candidate) => candidate.node.id === id);
    if (!body) return;
    if (pilot.isActive()) {
      if (flightReady && !flightPaused && body.node.kind === "planet") callbacks.onSelect(id);
      return;
    }
    if (currentView?.mode !== "cluster") { callbacks.onSelect(id); return; }
    if (!playing) return;
    const viewKey = currentView.key;
    const direction = camera.position.clone().sub(controls.target).normalize();
    const distance = body.extent / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.25 / Math.min(camera.aspect, 1);
    const target = body.object.position.clone();
    beginCameraTween({ position: target.clone().addScaledVector(direction, distance), target }, 0, () => {
      if (!destroyed && currentView?.key === viewKey && !pilot.isActive() && playing) callbacks.onSelect(id);
    });
  }

  function setView(view: UniverseSceneView) {
    const nextSignature = `${view.key}|${view.mode}|${Boolean(view.starName)}|${view.nodes.map(nodeGeometrySignature).join("|")}`;
    if (signature === nextSignature) {
      currentView = view;
      const nodes = new Map(view.nodes.map((node) => [node.id, node]));
      bodies.forEach((body) => { body.node = nodes.get(body.node.id) ?? body.node; });
      labels.forEach((label) => {
        const text = label.body?.node.name ?? view.starName ?? "";
        label.element.textContent = text;
        label.element.title = text;
        label.width = Math.min(140, Math.max(44, text.length * 6.2 + 14));
        label.element.style.width = `${label.width}px`;
      });
      requestRender();
      return;
    }
    finishWorldTransition();
    if (pilot.isActive() || flightMapPose) stopFlight();
    const previousView = currentView;
    const previousPose = pose();
    const previousFraming = focusFraming;
    const previousFar = camera.far;
    const previousRadius = sceneRadius;
    const previousLightPosition = sunLight.position.clone();
    const previousIntensity = sunLight.intensity;
    const entering = bodies.find((body) => `${body.node.kind}:${body.node.id}` === view.key);
    const parent = view.nodes.find((node) => `${node.kind}:${node.id}` === previousView?.key);
    const canTransition = Boolean(previousView && !reducedMotion && (entering || parent));
    const outgoing = new THREE.Group();
    const orbitsVisible = orbitGroup.visible;
    if (canTransition) {
      outgoing.add(viewGroup, orbitGroup);
      scene.add(outgoing);
    } else {
      disposeObjects(viewGroup, true);
      disposeObjects(orbitGroup, true);
      scene.remove(viewGroup, orbitGroup);
      viewGroup.clear();
      orbitGroup.clear();
    }
    viewGroup = new THREE.Group();
    orbitGroup = new THREE.Group();
    orbitGroup.visible = orbitsVisible;
    scene.add(viewGroup, orbitGroup);
    currentView = view;
    signature = nextSignature;
    semanticZoom.reset();
    userZoom = null;
    cameraTween = null;
    focusedId = null;
    selectedId = null;
    overviewPose = null;
    focusFraming = 0;
    labelLayer.replaceChildren();
    labelLayer.appendChild(guideButton);
    guideButton.hidden = true;
    flightTargetId = null;
    autopilotTargetId = null;
    bodies = [];
    labels = [];
    hitTargets = [];
    selection.visible = false;
    const focus = view.mode === "planet";
    const cluster = view.mode === "cluster";
    const layout = clusterScale(view.nodes);
    sceneRadius = focus ? 10 : cluster ? layout.radius : systemRadius(view.nodes.length);
    if (!canTransition) background.reset(sceneRadius, view);
    sunLight.position.set(0, 0, 0);
    sunLight.intensity = focus || cluster ? 0.7 : 3.8;

    if (view.mode === "system") {
      const star = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ map: starMap, color: 0xffffff, toneMapped: false }));
      star.scale.setScalar(3.4);
      viewGroup.add(star);
      addGlow(star, 8.6, 0xffffff, 0.75, coronaMap, false);
    }
    view.nodes.forEach((node, index) => {
      const object = new THREE.Group();
      const radius = focus ? 5.2 : cluster ? 0.8 : planetRadius(node.seed);
      let material: THREE.Material;
      if (cluster) material = new THREE.MeshBasicMaterial({ visible: false });
      else {
        const texture = planetTexture(node.seed, node.color, focus);
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.88, metalness: 0.05 });
      }
      const mesh = new THREE.Mesh(sphere, material);
      mesh.visible = !cluster;
      mesh.scale.setScalar(radius);
      mesh.rotation.z = (node.seed % 25) * Math.PI / 180;
      mesh.rotation.y = (node.seed % 17) / 17 * Math.PI;
      mesh.userData.id = node.id;
      object.add(mesh);
      const angle = orbitalAngle(index, orbitalTime);
      const orbit = focus || cluster ? 0 : systemOrbit(index);
      if (cluster) object.position.set(...clusterPosition(node, index, view.nodes.length, sceneRadius));
      else object.position.set(Math.cos(angle) * orbit, 0, Math.sin(angle) * orbit);
      const body: Body = { node, object, radius, extent: cluster ? layout.marker : radius, angle, orbit, mesh };
      viewGroup.add(object);
      bodies.push(body);
      if (!cluster) hitTargets.push(mesh);
      if (cluster) addCluster(body);
      else if (!focus) addOrbit(orbit);
      if (!cluster && node.seed % 4 === 0) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.4, radius * 2, 64), new THREE.MeshBasicMaterial({ color: node.color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2.7;
        object.add(ring);
      }
      if (labels.length < 10) addLabel(node.name, body);
    });
    fit();
    if (canTransition) {
      const destinationParent = bodies.find((body) => body.node.id === parent?.id);
      const scale = entering ? 1 / previewScale(entering.node, entering.extent) : previewScale(destinationParent!.node, destinationParent!.extent);
      const translation = entering ? entering.object.position.clone().multiplyScalar(-scale) : destinationParent!.object.position.clone();
      outgoing.scale.setScalar(scale);
      outgoing.position.copy(translation);
      background.remap(scale, translation);
      outgoing.traverse((object) => {
        if (object instanceof THREE.Points) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => { material.size *= scale; });
        }
      });
      const from = { position: previousPose.position.clone().multiplyScalar(scale).add(translation), target: previousPose.target.clone().multiplyScalar(scale).add(translation) };
      const direction = previousPose.position.clone().sub(previousPose.target).normalize();
      const to = { position: direction.multiplyScalar(overviewDistance), target: new THREE.Vector3() };
      const incoming = new THREE.Group();
      incoming.add(viewGroup, orbitGroup);
      scene.add(incoming);
      const incomingMaterials = fadeMaterials(incoming);
      setFade(incomingMaterials, 0);
      const outgoingMaterials = fadeMaterials(outgoing);
      // Keep the two live roots independently disposable during the short overlap.
      scene.attach(viewGroup);
      scene.attach(orbitGroup);
      scene.remove(incoming);
      camera.position.copy(from.position);
      controls.target.copy(from.target);
      focusFraming = previousFraming;
      updateFraming();
      const minDistance = controls.minDistance;
      const maxDistance = controls.maxDistance;
      controls.minDistance = Math.min(minDistance, camera.position.distanceTo(controls.target) * 0.8);
      controls.maxDistance = Math.max(controls.maxDistance, camera.position.distanceTo(controls.target) * 1.2);
      const far = camera.far;
      camera.far = Math.max(far, previousFar * scale, camera.position.length() + previousRadius * scale * 4 + translation.length());
      camera.updateProjectionMatrix();
      controls.enableDamping = false;
      controls.update();
      const fromLightPosition = previousLightPosition.multiplyScalar(scale).add(translation);
      const toIntensity = sunLight.intensity;
      sunLight.position.copy(fromLightPosition);
      sunLight.intensity = previousIntensity;
      worldTransition = { outgoing, incomingMaterials, outgoingMaterials, from, to, started: performance.now(), fromFraming: previousFraming, far, minDistance, maxDistance, fromLightPosition, fromIntensity: previousIntensity, toIntensity };
      labelLayer.style.opacity = "0";
      labelLayer.inert = true;
    }
  }

  function setSelected(id: string | null) {
    selectedId = id;
    updateLabelSelection();
    if (pilot.isActive()) { requestRender(); return; }
    const body = bodies.find((candidate) => candidate.node.id === id);
    const nextFocus = body?.node.id ?? null;
    if (nextFocus !== focusedId) {
      if (body) focusBody(body);
      else {
        focusedId = null;
        controls.minDistance = 7;
        if (overviewPose) beginCameraTween({ position: overviewPose.position.clone(), target: overviewPose.target.clone() }, 0);
      }
    }
    requestRender();
  }

  function updateLabelSelection() {
    const id = pilot.isActive() ? flightTargetId : selectedId;
    labels.forEach(({ element, body }) => {
      element.dataset.selected = String(body?.node.id === id);
      if (body) element.setAttribute("aria-pressed", String(body.node.id === id));
    });
  }

  function resize() {
    finishWorldTransition();
    const rect = container.getBoundingClientRect();
    const previousAspect = camera.aspect;
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    // The host reserves HUD space through inherited CSS, without scene/UI coupling.
    const styles = getComputedStyle(container);
    const top = Number.parseFloat(styles.getPropertyValue("--universe-label-inset-top"));
    const bottom = Number.parseFloat(styles.getPropertyValue("--universe-label-inset-bottom"));
    labelInsetTop = Number.isFinite(top) ? THREE.MathUtils.clamp(top, 0, height) : 24;
    labelInsetBottom = Number.isFinite(bottom) ? THREE.MathUtils.clamp(bottom, 0, height) : 12;
    camera.aspect = width / height;
    updateFraming();
    renderer.setSize(width, height);
    if (pilot.isActive()) {
      if (flightMapPose && Math.abs(previousAspect - camera.aspect) > 0.25) {
        const factor = Math.min(previousAspect, 1.5) / Math.min(camera.aspect, 1.5);
        flightMapPose.position.sub(flightMapPose.target).multiplyScalar(factor).add(flightMapPose.target);
        if (overviewPose) overviewPose.position.sub(overviewPose.target).multiplyScalar(factor).add(overviewPose.target);
      }
    } else if (signature && !focusedId && !cameraTween && (previousAspect < 0.85) !== (camera.aspect < 0.85)) {
      fit();
    } else if (signature && Math.abs(previousAspect - camera.aspect) > 0.25) {
      const factor = Math.min(previousAspect, 1.5) / Math.min(camera.aspect, 1.5);
      overviewDistance *= factor;
      if (focusDistance) focusDistance *= factor;
      camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
      if (overviewPose) overviewPose.position.sub(overviewPose.target).multiplyScalar(factor).add(overviewPose.target);
      if (cameraTween) {
        cameraTween.from.position.sub(cameraTween.from.target).multiplyScalar(factor).add(cameraTween.from.target);
        cameraTween.to.position.sub(cameraTween.to.target).multiplyScalar(factor).add(cameraTween.to.target);
      }
      controls.maxDistance = Math.max(controls.maxDistance, camera.position.length() * 2);
    }
    camera.far = Math.max(camera.far, controls.maxDistance + sceneRadius * 4);
    camera.updateProjectionMatrix();
    requestRender();
  }

  function requestRender() {
    if (frame === null && !destroyed && !unavailable && pageVisible && intersecting) frame = requestAnimationFrame(render);
  }

  function render(time: number) {
    frame = null;
    if (destroyed || unavailable || !pageVisible || !intersecting) return;
    const interacting = time < interactionUntil;
    if (time - lastRendered < (interacting ? 1000 / 60 : 1000 / 30)) {
      frame = requestAnimationFrame(render);
      return;
    }
    const delta = Math.min((time - previousTime) / 1000, 0.08);
    previousTime = time;
    lastRendered = time;
    const animate = playing && !reducedMotion;
    if (animate) orbitalTime += delta;
    if (animate) bodies.forEach((body) => {
      if (currentView?.mode === "system") {
        body.angle += delta * orbitalSpeed(body.orbit);
        body.object.position.set(Math.cos(body.angle) * body.orbit, 0, Math.sin(body.angle) * body.orbit);
      }
      body.miniPlanets?.forEach((planet) => {
        const angle = orbitalAngle(planet.index, orbitalTime);
        planet.mesh.position.set(Math.cos(angle) * planet.orbit * planet.scale, 0, Math.sin(angle) * planet.orbit * planet.scale);
      });
      body.mesh.rotation.y += delta * 0.09;
    });
    const piloting = pilot.isActive();
    const focused = bodies.find((body) => body.node.id === focusedId);
    if (!piloting && focused) {
      focusDelta.subVectors(focused.object.position, previousFocusPosition);
      camera.position.add(focusDelta);
      controls.target.add(focusDelta);
      if (cameraTween) {
        cameraTween.from.position.add(focusDelta);
        cameraTween.from.target.add(focusDelta);
        cameraTween.to.position.add(focusDelta);
        cameraTween.to.target.add(focusDelta);
      }
      previousFocusPosition.copy(focused.object.position);
    }
    if (!piloting && worldTransition) {
      const progress = Math.min(1, (time - worldTransition.started) / 720);
      const eased = progress * progress * (3 - 2 * progress);
      camera.position.lerpVectors(worldTransition.from.position, worldTransition.to.position, eased);
      controls.target.lerpVectors(worldTransition.from.target, worldTransition.to.target, eased);
      focusFraming = worldTransition.fromFraming * (1 - eased);
      setFade(worldTransition.incomingMaterials, eased);
      setFade(worldTransition.outgoingMaterials, 1 - eased);
      sunLight.position.copy(worldTransition.fromLightPosition).multiplyScalar(1 - eased);
      sunLight.intensity = THREE.MathUtils.lerp(worldTransition.fromIntensity, worldTransition.toIntensity, eased);
      updateFraming();
      if (progress === 1) finishWorldTransition();
    }
    if (!piloting && cameraTween) {
      const progress = Math.min(1, (time - cameraTween.started) / cameraTween.duration);
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      camera.position.lerpVectors(cameraTween.from.position, cameraTween.to.position, eased);
      controls.target.lerpVectors(cameraTween.from.target, cameraTween.to.target, eased);
      focusFraming = THREE.MathUtils.lerp(cameraTween.fromFraming, cameraTween.toFraming, eased);
      updateFraming();
      if (progress === 1) {
        const onComplete = cameraTween.onComplete;
        cameraTween = null;
        controls.enableDamping = !reducedMotion;
        if (!focusedId) overviewPose = null;
        onComplete?.();
      }
    }
    if (piloting) {
      pilot.update(delta);
    }
    else controls.update();
    sky.position.copy(camera.position);
    const backgroundFar = background.update(camera, height, renderer.getPixelRatio());
    if (backgroundFar > camera.far) {
      camera.far = backgroundFar * 1.02;
      camera.updateProjectionMatrix();
    }
    for (const body of bodies) if (body.detail && body.proxy) {
      const pixels = body.extent / camera.position.distanceTo(body.object.position) * height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      body.detail.visible = pixels >= 13;
      body.proxy.visible = !body.detail.visible;
    }
    evaluateSemanticZoom(time);
    const effectiveSelectedId = piloting ? flightTargetId : selectedId;
    const selected = bodies.find((body) => body.node.id === effectiveSelectedId);
    selection.visible = Boolean(selected) && !worldTransition;
    if (selected) {
      selection.position.copy(selected.object.position);
      selection.scale.setScalar(currentView?.mode === "cluster" ? selected.extent * 1.1 : selected.radius * 1.45);
      selection.lookAt(camera.position);
    }
    try {
      renderer.render(scene, camera);
      const placed: { left: number; top: number; right: number; bottom: number }[] = [];
      let guideVisible = false;
      if (piloting && flightReady && !flightPaused && guideActionLabel && selected?.node.kind === "planet") {
        labelPosition.copy(selected.object.position);
        labelPosition.y += selected.radius + 0.8;
        projected.copy(labelPosition).project(camera);
        const px = (projected.x * 0.5 + 0.5) * width;
        const py = (-projected.y * 0.5 + 0.5) * height;
        if (projected.z >= -1 && projected.z <= 1 && px >= 0 && px <= width && py >= 0 && py <= height && height - labelInsetBottom - labelInsetTop >= 44) {
          const x = THREE.MathUtils.clamp(px, guideWidth / 2 + 8, width - guideWidth / 2 - 8);
          const bottom = THREE.MathUtils.clamp(py - 8, labelInsetTop + 44, height - labelInsetBottom);
          guideButton.style.transform = `translate3d(${x.toFixed(1)}px,${bottom.toFixed(1)}px,0) translate(-50%,-100%)`;
          placed.push({ left: x - guideWidth / 2, right: x + guideWidth / 2, top: bottom - 44, bottom });
          guideVisible = true;
        }
      }
      guideButton.hidden = !guideVisible;
      const ordered = [...labels].sort((a, b) => Number(b.element === document.activeElement) - Number(a.element === document.activeElement) || Number(b.body?.node.id === effectiveSelectedId) - Number(a.body?.node.id === effectiveSelectedId) || Number(Boolean(b.body)) - Number(Boolean(a.body)));
      ordered.forEach(({ element, body, position, width: labelWidth }) => {
        labelPosition.copy(body?.object.position ?? position ?? new THREE.Vector3());
        if (body) labelPosition.y += currentView?.mode === "cluster" ? body.extent * 0.75 : body.radius + 0.8;
        projected.copy(labelPosition).project(camera);
        const projectedX = (projected.x * 0.5 + 0.5) * width;
        const x = THREE.MathUtils.clamp(projectedX, labelWidth / 2 + 8, width - labelWidth / 2 - 8);
        const y = (-projected.y * 0.5 + 0.5) * height;
        if (projected.z < -1 || projected.z > 1 || projectedX < 0 || projectedX > width || y < 0 || y > height) { element.hidden = true; return; }
        const minBottom = labelInsetTop + 44;
        const maxBottom = height - labelInsetBottom;
        if (minBottom > maxBottom) { element.hidden = true; return; }
        let visible = false;
        for (const offset of [0, -50, 50]) {
          const bottom = THREE.MathUtils.clamp(y + offset, minBottom, maxBottom);
          const rect = { left: x - labelWidth / 2, right: x + labelWidth / 2, top: bottom - 44, bottom };
          if (placed.some((other) => rect.left < other.right + 6 && rect.right > other.left - 6 && rect.top < other.bottom + 6 && rect.bottom > other.top - 6)) continue;
          placed.push(rect);
          visible = true;
          element.style.transform = `translate3d(${x.toFixed(1)}px,${bottom.toFixed(1)}px,0) translate(-50%,-100%)`;
          break;
        }
        element.hidden = !visible;
      });
      if (!ready && currentView) { ready = true; callbacks.onReady(); }
    } catch {
      unavailable = true;
      stopFlight();
      callbacks.onUnavailable();
      return;
    }
    if (animate || interacting || cameraTween || worldTransition || (piloting && !flightPaused)) requestRender();
  }

  function onControlStart() { cancelCameraTween(); interactionUntil = performance.now() + 60000; canvas.style.cursor = "grabbing"; requestRender(); }
  function onControlEnd() { interactionUntil = performance.now() + 450; canvas.style.cursor = "grab"; requestRender(); }
  function onPointerDown(event: PointerEvent) {
    activePointers.add(event.pointerId);
    if (event.pointerType === "touch") {
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPoints.size === 2) {
        const [a, b] = [...touchPoints.values()];
        pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      }
    }
    pointerStart = activePointers.size === 1 ? { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), dragged: false } : null;
  }
  function onPointerMove(event: PointerEvent) {
    if (touchPoints.has(event.pointerId)) {
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (event.isTrusted && touchPoints.size === 2 && controls.enabled && !pilot.isActive()) {
        const [a, b] = [...touchPoints.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (Math.abs(distance - pinchDistance) > 2) {
          const rect = canvas.getBoundingClientRect();
          userZoom = { direction: distance > pinchDistance ? "in" : "out", at: performance.now(), x: ((a.x + b.x) / 2 - rect.left) / width * 2 - 1, y: -((a.y + b.y) / 2 - rect.top) / height * 2 + 1 };
          pinchDistance = distance;
          requestRender();
        }
      }
    }
    if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 7) pointerStart.dragged = true;
  }
  function onPointerUp(event: PointerEvent) {
    activePointers.delete(event.pointerId);
    touchPoints.delete(event.pointerId);
    const start = pointerStart;
    pointerStart = null;
    if (pilot.isActive() && (!flightReady || flightPaused)) return;
    if (!start || start.dragged || event.button !== 0 || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7 || performance.now() - start.time > 700) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / width * 2 - 1, -(event.clientY - rect.top) / height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(hitTargets, false)[0];
    if (hit && typeof hit.object.userData.id === "string") {
      const id = hit.object.userData.id;
      requestSelection(id);
    }
  }
  function onPointerCancel(event: PointerEvent) { activePointers.delete(event.pointerId); touchPoints.delete(event.pointerId); pointerStart = null; }
  function onWheel(event: WheelEvent) {
    if (!event.isTrusted || !event.deltaY || !controls.enabled || pilot.isActive()) return;
    const rect = canvas.getBoundingClientRect();
    userZoom = { direction: event.deltaY < 0 ? "in" : "out", at: performance.now(), x: (event.clientX - rect.left) / width * 2 - 1, y: -(event.clientY - rect.top) / height * 2 + 1 };
    requestRender();
  }
  function evaluateSemanticZoom(time: number) {
    if (!currentView) return;
    let nearestGroup: { id: string; screenDistance: number } | undefined;
    if (currentView.mode === "cluster") for (const body of bodies) {
      if (body.node.kind === "planet") continue;
      projected.copy(body.object.position).project(camera);
      if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) continue;
      const screenDistance = Math.hypot(projected.x - (userZoom?.x ?? 0), projected.y - (userZoom?.y ?? 0));
      if (!nearestGroup || screenDistance < nearestGroup.screenDistance) nearestGroup = { id: body.node.id, screenDistance };
    }
    const decision = semanticZoom.evaluate({
      now: time, viewKey: currentView.key, mode: currentView.mode, selected: Boolean(focusedId),
      distance: camera.position.distanceTo(controls.target), overviewDistance, focusDistance,
      zoomDirection: userZoom && time - userZoom.at < 180 ? userZoom.direction : null,
      nearestGroup, hasParent: hasParentView,
      moving: Boolean(cameraTween || worldTransition) || pilot.isActive() || !playing,
    });
    if (decision) {
      userZoom = null;
      if (decision.type === "out") callbacks.onScaleOut();
      else callbacks.onScaleIn(decision.id);
    }
  }
  function stopFrame() { if (frame !== null) cancelAnimationFrame(frame); frame = null; previousTime = performance.now(); }
  function onVisibility() { pageVisible = !document.hidden; if (!pageVisible) guideButton.hidden = true; pilot.setPaused(flightPaused || !pageVisible || !intersecting); stopFrame(); if (pageVisible) requestRender(); }
  function onMotion() {
    reducedMotion = motionQuery.matches;
    if (reducedMotion && worldTransition) {
      camera.position.copy(worldTransition.to.position);
      controls.target.copy(worldTransition.to.target);
      focusFraming = 0;
      finishWorldTransition();
      updateFraming();
    }
    if (reducedMotion && cameraTween) {
      const onComplete = cameraTween.onComplete;
      camera.position.copy(cameraTween.to.position);
      controls.target.copy(cameraTween.to.target);
      focusFraming = cameraTween.toFraming;
      cameraTween = null;
      if (!focusedId) overviewPose = null;
      updateFraming();
      onComplete?.();
    }
    controls.enableDamping = !reducedMotion && !cameraTween;
    requestRender();
  }
  function onContextLost(event: Event) { event.preventDefault(); if (!unavailable) { unavailable = true; stopFlight(); stopFrame(); callbacks.onUnavailable(); } }

  function restoreMapCamera() {
    const saved = flightMapPose;
    flightMapPose = null;
    if (!saved) return;
    camera.position.copy(saved.position);
    controls.target.copy(saved.target);
    focusFraming = saved.framing;
    const focused = bodies.find((body) => body.node.id === focusedId);
    if (focused && saved.focusPosition) {
      focusDelta.subVectors(focused.object.position, saved.focusPosition);
      camera.position.add(focusDelta);
      controls.target.add(focusDelta);
      previousFocusPosition.copy(focused.object.position);
    }
    updateFraming();
    controls.enabled = !destroyed && !unavailable;
    controls.enableDamping = !reducedMotion;
    labelLayer.inert = false;
    updateLabelSelection();
    canvas.style.cursor = "grab";
    if (!destroyed && !unavailable) {
      controls.update();
      if (selectedId !== focusedId) setSelected(selectedId);
      requestRender();
    }
  }

  const pilot = createShipPilot({
    scene, camera, canvas,
    getSystemRadius: () => sceneRadius,
    getSpawnAnchor: () => controls.target.clone(),
    getObstacles: () => [
      ...(currentView?.mode === "system" ? [{ position: new THREE.Vector3(), radius: 3.4 }] : []),
      ...bodies.map((body) => ({ position: body.object.position, radius: body.radius })),
    ],
    reducedMotion: () => reducedMotion,
    onExit: () => {
      flightReady = false;
      flightTargetId = null;
      autopilotTargetId = null;
      guideButton.hidden = true;
      restoreMapCamera();
      callbacks.onFlightStatus("idle");
    },
    onAutopilotEnd: () => { autopilotTargetId = null; if (!destroyed) callbacks.onAutopilotEnd(); requestRender(); },
  });

  function stopFlight() {
    flightGeneration++;
    flightReady = false;
    flightTargetId = null;
    guideButton.hidden = true;
    const wasActive = pilot.isActive();
    pilot.exit();
    if (!wasActive) { restoreMapCamera(); callbacks.onFlightStatus("idle"); }
  }

  function setFlightEnabled(enabled: boolean) {
    if (!enabled) { stopFlight(); return; }
    if (destroyed || unavailable || currentView?.mode !== "system") { callbacks.onFlightStatus("idle"); return; }
    if (pilot.isActive()) return;
    finishWorldTransition();
    flightReady = false;
    const focused = bodies.find((body) => body.node.id === focusedId);
    flightMapPose = { ...pose(), framing: focusFraming, focusPosition: focused?.object.position.clone() ?? null };
    cancelCameraTween();
    focusFraming = 0;
    updateFraming();
    controls.enabled = false;
    labelLayer.inert = false;
    interactionUntil = 0;
    canvas.style.cursor = "crosshair";
    pilot.setPaused(flightPaused || !pageVisible || !intersecting);
    const generation = ++flightGeneration;
    callbacks.onFlightStatus("loading");
    void pilot.enter().then((loaded) => {
      if (destroyed || generation !== flightGeneration) return;
      if (loaded) {
        flightReady = true;
        callbacks.onFlightStatus("ready");
        requestRender();
      }
    }).catch(() => {
      if (destroyed || generation !== flightGeneration) return;
      restoreMapCamera();
      callbacks.onFlightStatus("error");
      requestRender();
    });
    requestRender();
  }

  function currentPlanet(id: string | null) {
    return currentView?.mode === "system" ? bodies.find((body) => body.node.id === id && body.node.kind === "planet") : undefined;
  }

  function setFlightTarget(id: string | null) {
    flightTargetId = pilot.isActive() && currentPlanet(id) ? id : null;
    guideButton.hidden = true;
    updateLabelSelection();
    requestRender();
  }

  function setAutopilotTarget(id: string | null) {
    if (id === autopilotTargetId) return;
    autopilotTargetId = id;
    if (!pilot.isActive()) { autopilotTargetId = null; return; }
    pilot.setAutopilotTarget(id ? () => {
      const body = currentPlanet(id);
      return body ? { position: body.object.position, radius: body.radius } : undefined;
    } : null);
    requestRender();
  }

  function onGuideClick(event: MouseEvent) {
    event.stopPropagation();
    const body = currentPlanet(flightTargetId);
    if (pilot.isActive() && flightReady && !flightPaused && body) callbacks.onGuideRequest(body.node.id);
  }
  guideButton.addEventListener("click", onGuideClick);

  controls.addEventListener("start", onControlStart);
  controls.addEventListener("end", onControlEnd);
  controls.addEventListener("change", requestRender);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("wheel", onWheel, { passive: true });
  canvas.addEventListener("webglcontextlost", onContextLost);
  document.addEventListener("visibilitychange", onVisibility);
  motionQuery.addEventListener("change", onMotion);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    intersecting = entry.isIntersecting;
    if (!intersecting) guideButton.hidden = true;
    pilot.setPaused(flightPaused || !pageVisible || !intersecting);
    stopFrame();
    if (intersecting) requestRender();
  });
  intersectionObserver.observe(container);
  resize();

  return {
    setView,
    setSelected,
    setAriaLabel(value: string) { canvas.setAttribute("aria-label", value); },
    setPlaying(value: boolean) {
      if (!value) finishWorldTransition();
      if (!value && cameraTween?.onComplete) cancelCameraTween();
      if (value && !playing) { semanticZoom.reset(); userZoom = null; }
      playing = value;
      requestRender();
    },
    setHasParentView(value: boolean) { hasParentView = value; },
    setOrbits(value: boolean) { orbitGroup.visible = value; bodies.forEach((body) => { if (body.localOrbits) body.localOrbits.visible = value; }); requestRender(); },
    setFlightEnabled,
    setFlightTarget,
    setAutopilotTarget,
    setGuideActionLabel(value: string) {
      guideActionLabel = value.trim();
      if (!guideActionLabel) guideButton.hidden = true;
      guideButton.textContent = guideActionLabel;
      guideWidth = Math.min(224, Math.max(120, guideActionLabel.length * 7 + 26));
      guideButton.style.width = `${guideWidth}px`;
      requestRender();
    },
    setFlightPaused(value: boolean) {
      flightPaused = value;
      if (value) guideButton.hidden = true;
      pilot.setPaused(value || !pageVisible || !intersecting);
      requestRender();
    },
    setFlightInput(value: ShipFlightInput) { pilot.setInput(value); requestRender(); },
    reset() {
      if (pilot.isActive()) return;
      finishWorldTransition();
      const focused = bodies.find((body) => body.node.id === focusedId);
      if (focused) focusBody(focused);
      else fit();
    },
    zoom(direction: "in" | "out") {
      if (pilot.isActive()) return;
      cancelCameraTween();
      const offset = camera.position.clone().sub(controls.target);
      const distance = THREE.MathUtils.clamp(offset.length() * (direction === "in" ? 0.82 : 1.22), controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offset.setLength(distance));
      controls.update();
      requestRender();
    },
    destroy() {
      destroyed = true;
      finishWorldTransition();
      flightGeneration++;
      pilot.dispose();
      background.dispose();
      guideButton.removeEventListener("click", onGuideClick);
      flightMapPose = null;
      stopFrame();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      motionQuery.removeEventListener("change", onMotion);
      controls.removeEventListener("start", onControlStart);
      controls.removeEventListener("end", onControlEnd);
      controls.removeEventListener("change", requestRender);
      controls.dispose();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      disposeObjects(scene, false);
      sharedMaps.forEach((map) => map.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      labelLayer.remove();
      bodies = []; labels = []; hitTargets = [];
    },
  };
}
