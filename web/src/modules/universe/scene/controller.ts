import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { SceneNode, UniverseSceneView } from "../domain/types";
import { getPlanetAppearance, type PlanetAppearance } from "../domain/planet-appearance";
import { glowTexture, planetTexture, starSurfaceTexture, starCoronaTexture, nebulaTexture } from "./textures";
import { createShipPilot, type ShipFlightInput } from "./flight";
import type { UniverseEntityTransition, UniverseFlightStatus, UniverseSceneErrorOperation, UniverseTourCameraStep } from "./types";
import { createEntityTransition, ENTITY_TRANSITION_DURATION_MS } from "./entity-transition";
import { createSemanticZoomGate } from "./semantic-zoom";
import { clusterPosition, clusterScale, nodeGeometrySignature, orbitalAngle, orbitalSpeed, planetRadius, previewScale, systemOrbit, systemRadius } from "./layout";
import { createSpatialBackground } from "./background";
import { createDestinationHover } from "./destination-hover";
import { createDestinationHighlight } from "./destination-highlight";
import { createTourDolly, type TourDolly } from "./tour-motion";
import { galaxyParticleTexture } from "./galaxy-particles";
import { createCloudHaze, createGalaxyVisual, createGlow, createRoundPointMaterial, updateCloudHaze, updateGalaxyVisual } from "./cluster-visuals";
import { createSurroundingContext, type ContextLabel } from "./surrounding-context";
import { isManualZoomSample } from "./zoom-intent";
import { isManualOrbitSample } from "./orbit-intent";
import { createPlanetSelection } from "./planet-selection";
import { createOrbitGuides } from "./orbit-guides";
import { createPlanetRings } from "./planet-rings";
import { isCameraPose, type UniverseCameraPose } from "../domain/camera-link";
import type { UniverseCameraRestore } from "./types";

type Callbacks = { onSelect: (id: string) => void; onSelectStar: () => void; onReady: () => void; onUnavailable: () => void; onError?: (error: unknown, operation: UniverseSceneErrorOperation) => void; onFlightStatus: (status: UniverseFlightStatus) => void; onGuideRequest: (id: string) => void; onAutopilotEnd: () => void; onScaleOut: () => void; onScaleIn: (id: string) => void; onTourArrive: (token: string) => void; onEntityTransitionEnd?: (token: string) => void; onInteraction: () => void; onZoomIntent?: (direction: "in" | "out") => void; onOrbitIntent?: () => void; onCameraGestureEnd?: (motion: "zoom" | "orbit") => void; onDestinationHover?: (id: string) => void; onCameraChange?: (pose: UniverseCameraPose, reason: "manual" | "navigation") => void; onCameraRestored?: (token: string, success: boolean) => void };
type Body = { node: SceneNode; object: THREE.Group; radius: number; extent: number; angle: number; orbit: number; mesh: THREE.Mesh; detail?: THREE.Group; proxy?: THREE.Sprite; previewPixels?: number; localOrbits?: THREE.Group; miniPlanets?: { mesh: THREE.Mesh; orbit: number; scale: number; index: number }[]; dust?: THREE.Points; core?: THREE.Sprite; highlight?: (active: boolean) => void; haze?: { primary: THREE.Sprite; secondary: THREE.Sprite } };
type Label = { element: HTMLElement; body?: Body; position?: THREE.Vector3; width: number; star?: boolean; context?: ContextLabel };
type CentralStar = { systemId: string; object: THREE.Mesh; highlight: (active: boolean) => void };
type CameraPose = { position: THREE.Vector3; target: THREE.Vector3 };
type TourCameraMotion = { dolly: TourDolly; fromDistance: number };
type CameraTween = { from: CameraPose; to: CameraPose; started: number; duration: number; fromFraming: number; toFraming: number; onComplete?: () => void; tourMotion?: TourCameraMotion };
type FlightMapPose = CameraPose & { framing: number; focusPosition: THREE.Vector3 | null };
type FadeMaterial = { material: THREE.Material; opacity: number; transparent: boolean; depthWrite: boolean };
type WorldTransition = { outgoing: THREE.Group; incomingMaterials: FadeMaterial[]; outgoingMaterials: FadeMaterial[]; from: CameraPose; to: CameraPose; started: number; duration: number; cameraOwned: boolean; fromFraming: number; far: number; minDistance: number; maxDistance: number; fromLightPosition: THREE.Vector3; fromIntensity: number; toIntensity: number; tourMotion?: TourCameraMotion };
const LABEL_BUDGET = 32;
const SYSTEM_PREVIEW_MIN_PIXELS = 28;
const MOBILE_SYSTEM_PREVIEW_BUDGET = 4;
const DESKTOP_SYSTEM_PREVIEW_BUDGET = 8;

export function createUniverseController(container: HTMLElement, callbacks: Callbacks) {
  function reportError(error: unknown, operation: UniverseSceneErrorOperation) {
    try { callbacks.onError?.(error, operation); } catch { /* Diagnostics must not interrupt scene recovery. */ }
  }

  if (typeof ResizeObserver === "undefined" || typeof IntersectionObserver === "undefined") throw new Error("Scene observers unavailable");
  const glowMap = glowTexture();
  const starMap = starSurfaceTexture();
  const coronaMap = starCoronaTexture();
  const nebulaMap = nebulaTexture();
  const galaxyPointMap = galaxyParticleTexture();
  const sharedMaps = new Set<THREE.Texture>([glowMap, starMap, coronaMap, nebulaMap, galaxyPointMap]);
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
  const clusterResources = { glowMap, coronaMap, galaxyPointMap, pixelRatio: () => renderer.getPixelRatio() };
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
  controls.zoomSpeed = 1.2;
  controls.autoRotateSpeed = 1;
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

  const background = createSpatialBackground(scene);
  const selection = new THREE.Mesh(new THREE.RingGeometry(1, 1.008, 64), new THREE.MeshBasicMaterial({ color: 0x48e9ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  selection.visible = false;
  scene.add(selection);
  const planetSelection = createPlanetSelection(sphere, galaxyPointMap);
  scene.add(planetSelection.root);
  let orbitGuides: ReturnType<typeof createOrbitGuides>[] = [];

  let bodies: Body[] = [];
  let systemPreviews: Body[] = [];
  let centralStar: CentralStar | null = null;
  let surroundingContext: ReturnType<typeof createSurroundingContext> | null = null;
  let contextMobile = false;
  let starSelected = false;
  let labels: Label[] = [];
  let hitTargets: THREE.Object3D[] = [];
  let currentView: UniverseSceneView | null = null;
  let signature = "";
  let selectedId: string | null = null;
  let focusedId: string | null = null;
  let tourStep: UniverseTourCameraStep | null = null;
  let tourPreparing = false;
  let arrivedTourToken: string | null = null;
  let overviewPose: CameraPose | null = null;
  let cameraTween: CameraTween | null = null;
  let worldTransition: WorldTransition | null = null;
  let entityTransition: { token: string; entityId: string | null; position: THREE.Vector3; started: number; visual: ReturnType<typeof createEntityTransition>; timeout: ReturnType<typeof setTimeout> } | null = null;
  let lastEntityTransitionToken: string | null = null;
  let previousEntityAnchors = new Map<string, { position: THREE.Vector3; radius: number }>();
  let previousEntityViewKey: string | undefined;
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
  let autoOrbit = true;
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
  let orbitPointer: number | null = null;
  let orbitPointerPosition: { x: number; y: number } | null = null;
  let gestureGeneration = 0;
  let orbitFeedbackActive = false;
  let zoomFeedbackActive = false;
  const wheelDistances = new WeakMap<WheelEvent, number>();
  const pointerMotionSamples = new WeakMap<PointerEvent, () => void>();
  let frame: number | null = null;
  let ready = false;
  let previousTime = performance.now();
  let lastRendered = 0;
  let interactionUntil = 0;
  let cameraReport: "manual" | "navigation" | null = null;
  let cameraReportAfter = 0;
  let cameraReportTimer: ReturnType<typeof setTimeout> | null = null;
  let restoredCameraToken: string | null = null;
  const projected = new THREE.Vector3();
  const labelPosition = new THREE.Vector3();
  const tourDirection = new THREE.Vector3();
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

  function notifyEntityTransitionEnd(token: string) {
    try { callbacks.onEntityTransitionEnd?.(token); } catch { /* Optional presentation cannot block editing. */ }
  }

  function finishEntityTransition(notify = true) {
    const transition = entityTransition;
    if (!transition) return;
    entityTransition = null;
    clearTimeout(transition.timeout);
    try { transition.visual.dispose(); } catch (error) { reportError(error, "render"); } finally {
      if (notify) notifyEntityTransitionEnd(transition.token);
    }
  }

  function setEntityTransition(transition: UniverseEntityTransition | null) {
    if (!transition) { finishEntityTransition(); requestRender(); return; }
    if (lastEntityTransitionToken === transition.token) return;
    lastEntityTransitionToken = transition.token;
    finishEntityTransition();
    if (destroyed || unavailable || reducedMotion) { notifyEntityTransitionEnd(transition.token); return; }
    try {
      const body = bodies.find((candidate) => candidate.node.id === transition.entityId);
      const star = centralStar?.systemId === transition.entityId ? centralStar.object : null;
      const previous = previousEntityViewKey === currentView?.key ? previousEntityAnchors.get(transition.entityId) : undefined;
      const position = body ? body.object.getWorldPosition(new THREE.Vector3()) : star ? star.getWorldPosition(new THREE.Vector3())
        : previous?.position.clone() ?? controls.target.clone();
      let radius = body ? currentView?.mode === "cluster" ? body.extent : body.radius : star ? 3.4 : previous?.radius
        ?? Math.min(sceneRadius * 0.15, Math.max(1, camera.position.distanceTo(controls.target) * 0.08));
      if (transition.kind === "universe") {
        // A universe birth spans the viewport, including an empty catalog with no body extent.
        const halfViewport = camera.position.distanceTo(position) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, width / height);
        radius = Math.max(radius, halfViewport * 0.3);
      }
      const visual = createEntityTransition(scene, {
        transition, position, radius, mobile: width < 640, pointMap: galaxyPointMap,
        glowMap: transition.kind === "system" ? coronaMap : glowMap, pixelRatio: () => renderer.getPixelRatio(),
      });
      const token = transition.token;
      const timeout = setTimeout(() => {
        if (entityTransition?.token !== token) return;
        finishEntityTransition();
        requestRender();
      }, ENTITY_TRANSITION_DURATION_MS + 100);
      entityTransition = { token, entityId: transition.action === "create" ? transition.entityId : null, position, started: performance.now(), visual, timeout };
      requestRender();
    } catch (error) {
      reportError(error, "render");
      notifyEntityTransitionEnd(transition.token);
    }
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
    // Preserve interrupted poses within the current level's navigation bounds.
    controls.minDistance = Math.min(transition.minDistance, distance);
    controls.maxDistance = zoomOutLimit(Math.max(transition.maxDistance, distance));
    camera.far = Math.max(transition.far, controls.maxDistance + sceneRadius * 4);
    camera.updateProjectionMatrix();
    sunLight.position.set(0, 0, 0);
    sunLight.intensity = transition.toIntensity;
    labelLayer.style.opacity = "";
    labelLayer.inert = false;
    controls.enableDamping = !reducedMotion;
  }

  function addGlow(group: THREE.Object3D, scale: number, color: string | number, opacity: number, map = glowMap, toneMapped = true) {
    return createGlow(group, scale, color, opacity, map, toneMapped);
  }

  function clearCameraReport() {
    if (cameraReportTimer !== null) clearTimeout(cameraReportTimer);
    cameraReportTimer = null; cameraReport = null;
  }

  function requestCameraReport(reason: "manual" | "navigation") {
    if (destroyed || unavailable || tourStep || tourPreparing) return;
    if (cameraReportTimer !== null) clearTimeout(cameraReportTimer);
    cameraReport = reason === "manual" ? reason : cameraReport ?? reason;
    cameraReportAfter = performance.now() + 350;
    cameraReportTimer = setTimeout(() => { cameraReportTimer = null; requestRender(); }, 350);
  }

  function readCameraPose(): UniverseCameraPose | null {
    if (destroyed || unavailable || !currentView || pilot.isActive()) return null;
    const body = bodies.find((body) => body.node.kind === "planet" && body.node.id === selectedId);
    const anchor = body?.object.position;
    // Planet-relative coordinates preserve framing across different orbital epochs.
    const result: UniverseCameraPose = {
      position: [camera.position.x - (anchor?.x ?? 0), camera.position.y - (anchor?.y ?? 0), camera.position.z - (anchor?.z ?? 0)],
      target: [controls.target.x - (anchor?.x ?? 0), controls.target.y - (anchor?.y ?? 0), controls.target.z - (anchor?.z ?? 0)],
    };
    return isCameraPose(result) ? result : null;
  }

  function restoreCamera(command: UniverseCameraRestore) {
    if (destroyed || unavailable || !currentView || pilot.isActive() || flightMapPose || tourStep || tourPreparing || restoredCameraToken === command.token) return;
    const planet = command.target.kind === "planet" ? bodies.find((body) => body.node.id === command.target.id && selectedId === command.target.id) : undefined;
    if (command.target.kind === "planet" ? !planet : currentView.key !== `${command.target.kind}:${command.target.id}`) return;
    restoredCameraToken = command.token;
    clearCameraReport();
    let success = false;
    if (isCameraPose(command.pose)) {
      suppressCameraGestures();
      finishWorldTransition(); cancelCameraTween(); clearZoomIntent();
      controls.autoRotate = false;
      const anchor = planet?.object.position;
      camera.position.set(...command.pose.position);
      controls.target.set(...command.pose.target);
      if (anchor) { camera.position.add(anchor); controls.target.add(anchor); previousFocusPosition.copy(anchor); }
      const offset = camera.position.clone().sub(controls.target);
      const distance = THREE.MathUtils.clamp(offset.length(), controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offset.setLength(distance));
      focusFraming = planet ? 1 : 0;
      updateFraming();
      const damping = controls.enableDamping;
      controls.enableDamping = false; controls.update(); controls.enableDamping = damping;
      camera.far = Math.max(camera.far, camera.position.length() + sceneRadius * 4);
      camera.updateProjectionMatrix();
      interactionUntil = performance.now() + 450;
      requestRender(); success = true;
    }
    try { callbacks.onCameraRestored?.(command.token, success); } catch { /* Optional URL state cannot interrupt rendering. */ }
  }

  function addOrbits(radii: number[], parent: THREE.Group = orbitGroup) {
    if (!radii.length) return;
    const guides = createOrbitGuides(radii);
    parent.add(guides.root);
    orbitGuides.push(guides);
  }

  function addPlanetRings(parent: THREE.Object3D, radius: number, appearance: PlanetAppearance, tilt = appearance.tilt) {
    if (!appearance.rings) return;
    const ring = createPlanetRings(radius, appearance.rings);
    ring.rotation.set(-Math.PI / 2, 0, tilt, "ZYX");
    parent.add(ring);
  }

  function roundPointMaterial(size: number, color: string | number, opacity: number, map = glowMap) {
    return createRoundPointMaterial(size, color, opacity, map, clusterResources.pixelRatio);
  }

  function refreshSurroundingContext(view: UniverseSceneView) {
    if (surroundingContext) {
      viewGroup.remove(surroundingContext.root);
      disposeObjects(surroundingContext.root, true);
    }
    contextMobile = width < 640;
    surroundingContext = createSurroundingContext(view, clusterResources, { mobile: contextMobile, elapsed: orbitalTime });
    viewGroup.add(surroundingContext.root);
    labels.filter((label) => label.context).forEach(({ element }) => element.remove());
    labels = labels.filter((label) => !label.context);
    for (const context of surroundingContext.labels) addLabel(context.name, undefined, context.position, false, context);
  }

  function addLabel(text: string, body?: Body, position?: THREE.Vector3, star = false, context?: ContextLabel) {
    const element = document.createElement(body || star ? "button" : "span");
    element.className = context ? "universe-node-label universe-context-label" : "universe-node-label";
    element.hidden = Boolean(context);
    element.textContent = text;
    element.title = text;
    const labelWidth = Math.min(140, Math.max(44, text.length * 6.2 + 14));
    element.style.width = `${labelWidth}px`;
    if (body || star) {
      (element as HTMLButtonElement).type = "button";
      element.dataset.destinationId = star ? centralStar!.systemId : body!.node.id;
      if (star) element.dataset.star = "true";
      element.addEventListener("click", () => {
        if (star) requestStarSelection();
        else requestSelection(body!.node.id);
      });
    } else element.style.pointerEvents = "none";
    labelLayer.appendChild(element);
    labels.push({ element, body, position, width: labelWidth, star, context });
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
        const appearance = getPlanetAppearance(planet.seed);
        const dot = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: planet.color, toneMapped: false }));
        dot.scale.setScalar(planetRadius(planet.seed) * scale);
        dot.rotation.z = appearance.tilt;
        addPlanetRings(dot, 1, appearance, 0);
        dot.position.set(Math.cos(angle) * orbit * scale, 0, Math.sin(angle) * orbit * scale);
        body.detail!.add(dot);
        body.miniPlanets!.push({ mesh: dot, orbit, scale, index });
      });
      addOrbits(body.miniPlanets.map((planet) => planet.orbit * scale), body.localOrbits);
      object.add(body.detail);
      body.proxy = addGlow(object, 5, 0xffffff, 0.9, coronaMap, false);
    } else if (node.kind === "cloud") {
      body.mesh.visible = false;
      body.haze = createCloudHaze(object, extent, node.color, clusterResources);
      updateCloudHaze(body.haze, node.seed, extent, orbitalTime);
      addStarPoints(object, children.filter((child) => child.kind === "system").map((child, index, systems) => clusterPosition(child, index, systems.length, extent * 1.1)), extent * 0.13);
    } else {
      body.mesh.visible = false;
      const visual = createGalaxyVisual(object, node.seed, extent, clusterResources, orbitalTime);
      body.dust = visual.dust;
      body.core = visual.core;
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
    }
    const hit = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    // The luminous core is the destination; the sparse outer dust is scenery.
    hit.scale.setScalar(extent * 0.24);
    hit.userData.id = node.id;
    object.add(hit);
    hitTargets.push(hit);
  }

  function addStarPoints(parent: THREE.Object3D, points: [number, number, number][], size: number) {
    if (!points.length) return;
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map((position) => new THREE.Vector3(...position)));
    const material = roundPointMaterial(size, 0xffffff, 0.95, coronaMap);
    material.blending = THREE.AdditiveBlending;
    parent.add(new THREE.Points(geometry, material));
  }

  function zoomOutLimit(proposed: number) {
    // The root overview is the end of the map; narrower levels must still reach
    // their outward hierarchy threshold through wheel or pinch.
    return currentView?.key.startsWith("universe:") ? overviewDistance : proposed;
  }

  function fit() {
    suppressCameraGestures();
    controls.autoRotate = false;
    cameraTween = null;
    focusFraming = 0;
    controls.enableDamping = !reducedMotion;
    updateFraming();
    const padding = currentView?.mode === "system" && camera.aspect >= 0.85 ? 1.4 : 1.15;
    const distance = sceneRadius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * padding / Math.min(camera.aspect, 1.5);
    const portrait = camera.aspect < 0.85;
    const portraitPadding = currentView?.mode === "system" ? 1.03 : 0.95;
    const cameraDistance = portrait && currentView?.mode !== "planet" ? distance * portraitPadding / padding : distance;
    overviewDistance = cameraDistance;
    userZoom = null;
    semanticZoom.reset();
    camera.position.set(...(portrait && currentView?.mode !== "planet" ? [0.12, 0.82, 0.55] : [0.16, 0.5, 0.85]) as [number, number, number]).normalize().multiplyScalar(cameraDistance);
    controls.target.set(0, 0, 0);
    controls.minDistance = currentView?.mode === "planet" ? 8 : 7;
    controls.maxDistance = zoomOutLimit(Math.max(180, distance * 3));
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

  function physicalSelectionRadius(center: THREE.Vector3, radius: number) {
    const distance = camera.position.distanceTo(center);
    if (!Number.isFinite(distance) || radius <= 0 || distance <= radius + camera.near) return null;
    // A billboard through the center must enclose the sphere's projected silhouette.
    return radius / Math.sqrt(1 - (radius / distance) ** 2) * 1.025;
  }

  function beginCameraTween(to: CameraPose, toFraming: number, onComplete?: () => void) {
    suppressCameraGestures();
    clearZoomIntent();
    controls.autoRotate = false;
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

  function cancelCameraTween(keepOverlap = false) {
    if (keepOverlap && worldTransition) worldTransition.cameraOwned = false;
    else finishWorldTransition();
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

  function requestStarSelection() {
    if (!centralStar || currentView?.mode !== "system" || pilot.isActive() || !playing || worldTransition) return;
    callbacks.onSelectStar();
  }

  function setView(view: UniverseSceneView) {
    const anchorSignature = view.anchor ? `${view.anchor.kind}:${view.anchor.seed}:${view.anchor.color}` : "";
    const ancestrySignature = view.ancestors?.[0] ? nodeGeometrySignature(view.ancestors[0]) : "";
    const nextSignature = `${view.key}|${view.mode}|${Boolean(view.starName)}|${anchorSignature}|${ancestrySignature}|${view.nodes.map(nodeGeometrySignature).join("|")}`;
    if (signature === nextSignature) {
      currentView = view;
      const nodes = new Map(view.nodes.map((node) => [node.id, node]));
      bodies.forEach((body) => { body.node = nodes.get(body.node.id) ?? body.node; });
      const names = new Map<string, string>();
      const collectNames = (node: SceneNode) => {
        names.set(node.id, node.name);
        node.children?.forEach(collectNames);
      };
      if (view.ancestors?.[0]) collectNames(view.ancestors[0]);
      else if (view.anchor) collectNames(view.anchor);
      else view.nodes.forEach(collectNames);
      labels.forEach((label) => {
        if (label.context) label.context.name = names.get(label.context.id) ?? label.context.name;
        const text = label.context?.name ?? label.body?.node.name ?? view.starName ?? "";
        label.element.textContent = text;
        label.element.title = text;
        label.width = Math.min(140, Math.max(44, text.length * 6.2 + 14));
        label.element.style.width = `${label.width}px`;
      });
      requestRender();
      return;
    }
    suppressCameraGestures();
    // Keep only one bounded snapshot for deletion after the projection is rebuilt.
    previousEntityViewKey = currentView?.key;
    previousEntityAnchors = new Map();
    const priorBodies = [...bodies].sort((a, b) => Number(b.node.id === selectedId) - Number(a.node.id === selectedId));
    for (const body of priorBodies.slice(0, 128)) previousEntityAnchors.set(body.node.id, {
      position: body.object.getWorldPosition(new THREE.Vector3()), radius: currentView?.mode === "cluster" ? body.extent : body.radius,
    });
    if (centralStar) previousEntityAnchors.set(centralStar.systemId, { position: centralStar.object.getWorldPosition(new THREE.Vector3()), radius: 3.4 });
    if (currentView?.key !== view.key) finishEntityTransition();
    finishWorldTransition();
    destinationHover.clear();
    centralStar = null;
    starSelected = false;
    surroundingContext = null;
    // Outgoing roots keep their guides for the existing crossfade/disposal owner.
    orbitGuides = [];
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
    systemPreviews = [];
    labels = [];
    hitTargets = [];
    selection.visible = false;
    planetSelection.hide();
    const focus = view.mode === "planet";
    const cluster = view.mode === "cluster";
    const layout = clusterScale(view.nodes);
    sceneRadius = focus ? 10 : cluster ? layout.radius : systemRadius(view.nodes.length);
    if (!canTransition) background.reset(sceneRadius, view);
    sunLight.position.set(0, 0, 0);
    sunLight.intensity = focus || cluster ? 0.7 : 3.8;

    refreshSurroundingContext(view);
    if (view.mode === "system") {
      const star = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ map: starMap, color: 0xffffff, toneMapped: false }));
      star.scale.setScalar(3.4);
      viewGroup.add(star);
      addGlow(star, 8.6, 0xffffff, 0.75, coronaMap, false);
      // Reuse the unique parent system ID, which cannot collide with child planets.
      const systemId = view.key.slice("system:".length);
      star.userData.id = systemId;
      star.userData.star = true;
      centralStar = { systemId, object: star, highlight: createDestinationHighlight(star) };
      hitTargets.push(star);
      addLabel(view.starName ?? "", undefined, new THREE.Vector3(), true);
    }
    view.nodes.forEach((node, index) => {
      const object = new THREE.Group();
      const appearance = getPlanetAppearance(node.seed);
      const radius = focus ? 5.2 : cluster ? 0.8 : planetRadius(node.seed);
      let material: THREE.Material;
      if (cluster) material = new THREE.MeshBasicMaterial({ visible: false });
      else {
        const texture = planetTexture(node.seed, node.color, focus);
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        material = new THREE.MeshStandardMaterial({ map: texture, roughness: appearance.roughness, metalness: appearance.metalness });
      }
      const mesh = new THREE.Mesh(sphere, material);
      mesh.visible = !cluster;
      mesh.scale.setScalar(radius);
      mesh.rotation.order = "ZYX";
      mesh.rotation.z = appearance.tilt;
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
      if (!cluster) addPlanetRings(object, radius, appearance);
      body.highlight = createDestinationHighlight(object);
      if (labels.filter((label) => !label.context).length < LABEL_BUDGET) addLabel(node.name, body);
    });
    systemPreviews = bodies.filter((body) => body.detail && body.proxy);
    if (!cluster && !focus) addOrbits(bodies.map((body) => body.orbit));
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
      // Capture each incoming guide's destination opacity, rather than fading to a
      // default that would change abruptly when distance-aware rendering resumes.
      for (const guides of orbitGuides) guides.update(camera, height, to.position);
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
      controls.maxDistance = zoomOutLimit(Math.max(controls.maxDistance, camera.position.distanceTo(controls.target) * 1.2));
      const far = camera.far;
      camera.far = Math.max(far, previousFar * scale, camera.position.length() + previousRadius * scale * 4 + translation.length());
      camera.updateProjectionMatrix();
      controls.enableDamping = false;
      controls.update();
      const fromLightPosition = previousLightPosition.multiplyScalar(scale).add(translation);
      const toIntensity = sunLight.intensity;
      sunLight.position.copy(fromLightPosition);
      sunLight.intensity = previousIntensity;
      worldTransition = { outgoing, incomingMaterials, outgoingMaterials, from, to, started: performance.now(), duration: 720, cameraOwned: true, fromFraming: previousFraming, far, minDistance, maxDistance, fromLightPosition, fromIntensity: previousIntensity, toIntensity };
      labelLayer.style.opacity = "0";
      labelLayer.inert = true;
    }
    requestCameraReport("navigation");
  }

  function setSelected(id: string | null) {
    if (selectedId !== id) requestCameraReport("navigation");
    selectedId = id;
    if (id) starSelected = false;
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

  function setStarSelected(value: boolean) {
    starSelected = value && Boolean(centralStar) && currentView?.mode === "system" && !pilot.isActive();
    updateLabelSelection();
    if (starSelected) {
      requestCameraReport("navigation");
      focusedId = null;
      focusDistance = undefined;
      selectedId = null;
      overviewPose = null;
      controls.minDistance = 7;
      const direction = camera.position.clone().sub(controls.target).normalize();
      beginCameraTween({ position: direction.multiplyScalar(overviewDistance), target: new THREE.Vector3() }, 1);
    }
    // Clearing is visual-only, so a new planet's focus tween keeps ownership.
    requestRender();
  }

  function setTourStep(step: UniverseTourCameraStep | null) {
    if (step) { clearCameraReport(); suppressCameraGestures(); }
    if (step?.token === tourStep?.token) return;
    const previous = tourStep;
    tourStep = step;
    arrivedTourToken = null;
    if (!step) {
      if (previous && (cameraTween || worldTransition)) cancelCameraTween();
      if (previous) requestCameraReport("navigation");
      requestRender();
      return;
    }
    clearZoomIntent();
    destinationHover.clear();
    interactionUntil = 0;
    if (step.target.kind === "planet") {
      const body = bodies.find((candidate) => candidate.node.id === step.target.id);
      if (!body) return;
      selectedId = body.node.id;
      starSelected = false;
      updateLabelSelection();
      focusBody(body);
    } else if (currentView?.key === `${step.target.kind}:${step.target.id}`) {
      if (worldTransition) {
        // Manual replay follows adjacent views from their live, similarity-mapped pose.
        if (step.motion !== "approach") configureTourMotion(worldTransition, false, step.target.kind === "universe");
      }
      else {
        const direction = camera.position.clone().sub(controls.target).normalize();
        beginCameraTween({ position: direction.multiplyScalar(overviewDistance), target: new THREE.Vector3() }, 0);
        if (cameraTween && step.motion !== "approach") configureTourMotion(cameraTween, step.target.kind === "system", step.target.kind === "universe");
      }
    }
    requestRender();
  }

  function configureTourMotion(animation: CameraTween | WorldTransition, start: boolean, end: boolean) {
    const fromDistance = animation.from.position.distanceTo(animation.from.target);
    const dolly = createTourDolly(fromDistance, animation.to.position.distanceTo(animation.to.target), { start, end });
    if (!dolly) return;
    animation.tourMotion = { dolly, fromDistance };
    animation.duration = dolly.duration;
  }

  function moveTourCamera(animation: CameraTween | WorldTransition, elapsed: number, panProgress: number) {
    const motion = animation.tourMotion!;
    const sample = motion.dolly.sample(elapsed);
    // Similarity remaps preserve apparent velocity. Resize may scale both poses.
    tourDirection.subVectors(animation.from.position, animation.from.target);
    const scale = tourDirection.length() / motion.fromDistance;
    tourDirection.normalize();
    controls.target.lerpVectors(animation.from.target, animation.to.target, panProgress);
    camera.position.copy(controls.target).addScaledVector(tourDirection, sample.distance * scale);
  }

  function updateLabelSelection() {
    const id = pilot.isActive() ? flightTargetId : selectedId;
    labels.forEach(({ element, body }) => {
      const selected = element.dataset.star === "true" ? starSelected : body?.node.id === id;
      element.dataset.selected = String(selected);
      if (body || element.dataset.star === "true") element.setAttribute("aria-pressed", String(selected));
    });
  }

  function resize() {
    destinationHover.clear();
    finishWorldTransition();
    const rect = container.getBoundingClientRect();
    const previousAspect = camera.aspect;
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    if (currentView && contextMobile !== (width < 640)) refreshSurroundingContext(currentView);
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
      controls.maxDistance = zoomOutLimit(Math.max(controls.maxDistance, camera.position.length() * 2));
    }
    camera.far = Math.max(camera.far, controls.maxDistance + sceneRadius * 4);
    camera.updateProjectionMatrix();
    requestRender();
  }

  function requestRender() {
    if (frame === null && !destroyed && !unavailable && pageVisible && intersecting) frame = requestAnimationFrame(render);
  }

  function clearZoomIntent() {
    endCameraGesture("zoom");
    userZoom = null;
    semanticZoom.cancelPending();
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
      if (body.detail?.visible !== false) body.miniPlanets?.forEach((planet) => {
        const angle = orbitalAngle(planet.index, orbitalTime);
        planet.mesh.position.set(Math.cos(angle) * planet.orbit * planet.scale, 0, Math.sin(angle) * planet.orbit * planet.scale);
      });
      body.mesh.rotation.y += delta * 0.09;
      if (body.dust && body.core) updateGalaxyVisual({ dust: body.dust, core: body.core }, body.node.seed, body.extent, orbitalTime);
      if (body.haze) updateCloudHaze(body.haze, body.node.seed, body.extent, orbitalTime);
    });
    if (entityTransition) {
      try {
        const target = entityTransition.entityId ? bodies.find((body) => body.node.id === entityTransition!.entityId)?.object
          ?? (centralStar?.systemId === entityTransition.entityId ? centralStar.object : null) : null;
        if (target) entityTransition.visual.setPosition(target.getWorldPosition(entityTransition.position));
        if (entityTransition.visual.update(time - entityTransition.started)) finishEntityTransition();
      } catch (error) {
        finishEntityTransition();
        reportError(error, "render");
      }
    }
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
      const progress = Math.min(1, (time - worldTransition.started) / worldTransition.duration);
      const eased = progress * progress * (3 - 2 * progress);
      if (worldTransition.cameraOwned) {
        if (worldTransition.tourMotion) moveTourCamera(worldTransition, time - worldTransition.started, eased);
        else {
          camera.position.lerpVectors(worldTransition.from.position, worldTransition.to.position, eased);
          controls.target.lerpVectors(worldTransition.from.target, worldTransition.to.target, eased);
        }
      }
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
      const eased = cameraTween.tourMotion ? progress * progress * (3 - 2 * progress)
        : progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      if (cameraTween.tourMotion) moveTourCamera(cameraTween, time - cameraTween.started, eased);
      else {
        camera.position.lerpVectors(cameraTween.from.position, cameraTween.to.position, eased);
        controls.target.lerpVectors(cameraTween.from.target, cameraTween.to.target, eased);
      }
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
      controls.autoRotate = false;
      pilot.update(delta);
    }
    else {
      controls.autoRotate = autoOrbit && Boolean(focused) && playing && !reducedMotion && !cameraTween && !worldTransition &&
        time >= interactionUntil && !semanticZoom.hasPending() && !(userZoom && time - userZoom.at < 450);
      controls.update(delta);
    }
    sky.position.copy(camera.position);
    background.update(camera, height, renderer.getPixelRatio());
    const contextFar = surroundingContext ? camera.position.length() + surroundingContext.radius : 0;
    if (contextFar > camera.far) {
      camera.far = contextFar * 1.02;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    if (cameraReport && time >= cameraReportAfter && !cameraTween && !worldTransition && !tourStep && !tourPreparing && !piloting && activePointers.size === 0) {
      const reason = cameraReport;
      clearCameraReport();
      const snapshot = readCameraPose();
      if (snapshot) {
        try { callbacks.onCameraChange?.(snapshot, reason); } catch { /* URL persistence is optional. */ }
      }
    }
    surroundingContext?.update(orbitalTime, camera, height);
    // Crossfades own both roots' opacity until the old root has been disposed.
    if (!worldTransition) for (const guides of orbitGuides) guides.update(camera, height);
    for (const body of systemPreviews) {
      projected.copy(body.object.position).project(camera);
      const visible = projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= 1.2 && Math.abs(projected.y) <= 1.2;
      body.previewPixels = visible ? body.extent / camera.position.distanceTo(body.object.position) * height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) : 0;
    }
    systemPreviews.sort((a, b) => (b.previewPixels ?? 0) - (a.previewPixels ?? 0));
    const previewBudget = width < 640 ? MOBILE_SYSTEM_PREVIEW_BUDGET : DESKTOP_SYSTEM_PREVIEW_BUDGET;
    systemPreviews.forEach((body, index) => {
      body.detail!.visible = index < previewBudget && (body.previewPixels ?? 0) >= SYSTEM_PREVIEW_MIN_PIXELS;
      body.proxy!.visible = !body.detail!.visible;
    });
    evaluateSemanticZoom(time);
    const effectiveSelectedId = piloting ? flightTargetId : selectedId;
    const selected = bodies.find((body) => body.node.id === effectiveSelectedId);
    const physicalPlanet = selected?.node.kind === "planet" && currentView?.mode !== "cluster";
    selection.visible = Boolean(selected || starSelected && centralStar && !piloting) && !worldTransition && !physicalPlanet;
    planetSelection.hide();
    if (selected && physicalPlanet && !worldTransition) {
      planetSelection.update(selected.object.position, selected.radius, selected.mesh.quaternion, camera, height);
    } else if (selected) {
      selection.position.copy(selected.object.position);
      const radius = currentView?.mode === "cluster" ? selected.extent * 1.1 : physicalSelectionRadius(selected.object.position, selected.radius);
      if (radius === null) selection.visible = false;
      else selection.scale.setScalar(radius);
      selection.lookAt(camera.position);
    }
    else if (starSelected && centralStar && !piloting) {
      selection.position.copy(centralStar.object.position);
      const radius = physicalSelectionRadius(centralStar.object.position, 3.4);
      if (radius === null) selection.visible = false;
      else selection.scale.setScalar(radius);
      selection.lookAt(camera.position);
    }
    try {
      destinationHover.update({ enabled: playing && !piloting && !worldTransition && !cameraTween && !tourStep, dragging: activePointers.size > 0 });
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
      const isSelectedLabel = (label: Label) => label.star ? starSelected : label.body?.node.id === effectiveSelectedId;
      const ordered = [...labels].sort((a, b) => Number(b.element === document.activeElement) - Number(a.element === document.activeElement) || Number(isSelectedLabel(b)) - Number(isSelectedLabel(a)) || Number(Boolean(b.body)) - Number(Boolean(a.body)));
      ordered.forEach(({ element, body, position, width: labelWidth, star, context }) => {
        if (context) {
          element.style.opacity = String(context.opacity);
          if (worldTransition || context.opacity < 0.05) { element.hidden = true; return; }
        }
        if (star) (element as HTMLButtonElement).disabled = piloting;
        labelPosition.copy(body?.object.position ?? position ?? new THREE.Vector3());
        projected.copy(labelPosition).project(camera);
        const projectedX = (projected.x * 0.5 + 0.5) * width;
        const x = THREE.MathUtils.clamp(projectedX, labelWidth / 2 + 8, width - labelWidth / 2 - 8);
        // The bottom-anchored 44px target centers its text 22px above this point.
        const y = (-projected.y * 0.5 + 0.5) * height - (body || star ? 6 : 0);
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
      if (tourStep && arrivedTourToken !== tourStep.token && !cameraTween && !worldTransition && playing) {
        arrivedTourToken = tourStep.token;
        callbacks.onTourArrive(tourStep.token);
      }
    } catch (error) {
      reportError(error, "render");
      unavailable = true;
      stopFlight();
      callbacks.onUnavailable();
      return;
    }
    if (animate || interacting || cameraTween || worldTransition || entityTransition || semanticZoom.hasPending() || (piloting && !flightPaused)) requestRender();
  }

  function endCameraGesture(motion: "zoom" | "orbit") {
    // Invalidate an input's queued after-dispatch sample before notifying the host.
    gestureGeneration++;
    if (motion === "zoom" ? !zoomFeedbackActive : !orbitFeedbackActive) return;
    if (motion === "zoom") zoomFeedbackActive = false;
    else orbitFeedbackActive = false;
    try { callbacks.onCameraGestureEnd?.(motion); } catch { /* Optional feedback cannot own camera input. */ }
  }

  function suppressCameraGestures() {
    endCameraGesture("zoom");
    endCameraGesture("orbit");
    orbitPointer = null;
    orbitPointerPosition = null;
  }

  function manualCameraAvailable() {
    return !destroyed && !unavailable && pageVisible && intersecting && controls.enabled && playing &&
      !pilot.isActive() && !cameraTween && !worldTransition?.cameraOwned && !tourStep && !tourPreparing;
  }

  function reportZoomIntent(direction: "in" | "out") {
    if (!manualCameraAvailable()) return;
    zoomFeedbackActive = true;
    try { callbacks.onZoomIntent?.(direction); } catch { /* Optional feedback must not interrupt navigation. */ }
  }

  function onControlStart() { callbacks.onInteraction(); controls.autoRotate = false; cancelCameraTween(true); interactionUntil = performance.now() + 60000; canvas.style.cursor = "grabbing"; requestRender(); }
  function onControlEnd() { endCameraGesture("orbit"); interactionUntil = performance.now() + 450; canvas.style.cursor = "grab"; requestCameraReport("manual"); requestRender(); }
  function onPointerDown(event: PointerEvent) {
    callbacks.onInteraction();
    clearZoomIntent();
    endCameraGesture("orbit");
    activePointers.add(event.pointerId);
    // OrbitControls installs its document listener in its earlier pointerdown
    // handler. Reappend ours after it, including the start of each new gesture.
    document.removeEventListener("pointermove", onAfterControlPointerMove);
    document.addEventListener("pointermove", onAfterControlPointerMove);
    orbitPointer = event.isTrusted && activePointers.size === 1 && event.button === 0 ? event.pointerId : null;
    orbitPointerPosition = orbitPointer !== null ? { x: event.clientX, y: event.clientY } : null;
    if (event.pointerType === "touch") {
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPoints.size === 2) {
        const [a, b] = [...touchPoints.values()];
        pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      }
    }
    pointerStart = activePointers.size === 1 ? { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), dragged: false } : null;
  }
  function onAfterControlPointerMove(event: PointerEvent) {
    const sample = pointerMotionSamples.get(event);
    pointerMotionSamples.delete(event);
    sample?.();
  }
  function onPointerMove(event: PointerEvent) {
    if (event.isTrusted && orbitPointer === event.pointerId && activePointers.size === 1 && orbitPointerPosition && event.buttons !== 0 &&
      Math.hypot(event.clientX - orbitPointerPosition.x, event.clientY - orbitPointerPosition.y) > 0) {
      const before = { azimuth: controls.getAzimuthalAngle(), polar: controls.getPolarAngle() };
      const generation = gestureGeneration;
      orbitPointerPosition = { x: event.clientX, y: event.clientY };
      // Consume after OrbitControls handles this exact event on document.
      // A microtask here runs too early for native event listener checkpoints.
      pointerMotionSamples.set(event, () => {
        if (generation !== gestureGeneration || destroyed) return;
        const manual = orbitPointer === event.pointerId && activePointers.size === 1 && manualCameraAvailable();
        if (!isManualOrbitSample({ before, after: { azimuth: controls.getAzimuthalAngle(), polar: controls.getPolarAngle() }, manual, inputMoved: true })) { endCameraGesture("orbit"); return; }
        orbitFeedbackActive = true;
        try { callbacks.onOrbitIntent?.(); } catch { /* Optional audio cannot interrupt camera movement. */ }
      });
    } else if (orbitPointer === event.pointerId && event.buttons === 0) {
      endCameraGesture("orbit");
      orbitPointer = null; orbitPointerPosition = null;
    }
    if (touchPoints.has(event.pointerId)) {
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (event.isTrusted && touchPoints.size === 2 && controls.enabled && playing && !pilot.isActive()) {
        const [a, b] = [...touchPoints.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance > 0 && distance !== pinchDistance) {
          cancelCameraTween(true);
          const before = controls.getDistance();
          const generation = gestureGeneration;
          const x = (a.x + b.x) / 2; const y = (a.y + b.y) / 2;
          pinchDistance = distance;
          pointerMotionSamples.set(event, () => {
            if (generation !== gestureGeneration || destroyed) return;
            const after = controls.getDistance();
            if (!isManualZoomSample(before, after, touchPoints.size === 2 && manualCameraAvailable())) { endCameraGesture("zoom"); return; }
            const rect = canvas.getBoundingClientRect();
            userZoom = { direction: after < before ? "in" : "out", at: performance.now(), x: (x - rect.left) / width * 2 - 1, y: -(y - rect.top) / height * 2 + 1 };
            reportZoomIntent(userZoom.direction);
            requestRender();
          });
        }
      }
    }
    if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 7) pointerStart.dragged = true;
  }
  function promoteRemainingTouch(event: PointerEvent) {
    if (!event.isTrusted || event.pointerType !== "touch" || activePointers.size !== 1 || touchPoints.size !== 1) return;
    const id = [...activePointers][0];
    const position = touchPoints.get(id);
    if (!position) return;
    // OrbitControls also changes back to one-finger rotation. Wait for the next
    // physical move before comparing angles or renewing any audio.
    orbitPointer = id;
    orbitPointerPosition = position;
  }
  function onPointerUp(event: PointerEvent) {
    const pinching = touchPoints.size >= 2 && touchPoints.has(event.pointerId);
    endCameraGesture("orbit");
    if (pinching) endCameraGesture("zoom");
    if (orbitPointer === event.pointerId) { orbitPointer = null; orbitPointerPosition = null; }
    activePointers.delete(event.pointerId);
    touchPoints.delete(event.pointerId);
    if (activePointers.size === 0) document.removeEventListener("pointermove", onAfterControlPointerMove);
    promoteRemainingTouch(event);
    const start = pointerStart;
    pointerStart = null;
    if (pilot.isActive() && (!flightReady || flightPaused)) return;
    if (!start || start.dragged || event.button !== 0 || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7 || performance.now() - start.time > 700) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / width * 2 - 1, -(event.clientY - rect.top) / height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(hitTargets, false)[0];
    if (hit?.object.userData.star) { requestStarSelection(); return; }
    if (hit && typeof hit.object.userData.id === "string") {
      const id = hit.object.userData.id;
      requestSelection(id);
    }
  }
  function onPointerCancel(event: PointerEvent) { suppressCameraGestures(); activePointers.delete(event.pointerId); touchPoints.delete(event.pointerId); if (activePointers.size === 0) document.removeEventListener("pointermove", onAfterControlPointerMove); pointerStart = null; clearZoomIntent(); promoteRemainingTouch(event); }
  function onLostPointerCapture(event: PointerEvent) { if (activePointers.has(event.pointerId)) onPointerCancel(event); }
  function onWindowBlur() { suppressCameraGestures(); activePointers.clear(); touchPoints.clear(); document.removeEventListener("pointermove", onAfterControlPointerMove); pointerStart = null; clearZoomIntent(); }
  function onWheelCapture(event: WheelEvent) { if (event.isTrusted) wheelDistances.set(event, controls.getDistance()); }
  function onWheel(event: WheelEvent, before = wheelDistances.get(event)) {
    if (!event.isTrusted || !event.deltaY || !controls.enabled || !playing || pilot.isActive()) return;
    cancelCameraTween(true);
    const rect = canvas.getBoundingClientRect();
    userZoom = { direction: event.deltaY < 0 ? "in" : "out", at: performance.now(), x: (event.clientX - rect.left) / width * 2 - 1, y: -(event.clientY - rect.top) / height * 2 + 1 };
    if (before !== undefined && isManualZoomSample(before, controls.getDistance(), manualCameraAvailable())) reportZoomIntent(userZoom.direction);
    else endCameraGesture("zoom");
    requestCameraReport("manual");
    requestRender();
  }
  function onLabelWheel(event: WheelEvent) {
    if (!event.isTrusted || !event.deltaY || !controls.enabled || !playing || pilot.isActive()) return;
    event.preventDefault();
    event.stopPropagation();
    const before = controls.getDistance();
    // Labels are canvas siblings: forward the optical dolly, retaining native intent.
    canvas.dispatchEvent(new WheelEvent("wheel", {
      clientX: event.clientX, clientY: event.clientY, deltaX: event.deltaX, deltaY: event.deltaY, deltaZ: event.deltaZ, deltaMode: event.deltaMode,
      ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey, cancelable: true,
    }));
    onWheel(event, before);
  }
  function evaluateSemanticZoom(time: number) {
    if (!currentView || tourStep) return;
    camera.updateMatrixWorld();
    let nearestGroup: { id: string; screenDistance: number } | undefined;
    let nearestDistance = Infinity;
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    if (currentView.mode === "cluster") for (const body of bodies) {
      if (body.node.kind === "planet") continue;
      const distance = camera.position.distanceTo(body.object.position);
      projected.copy(body.object.position).project(camera);
      const radiusY = body.extent / Math.max(0.01, distance) / tangent;
      const radiusX = radiusY / camera.aspect;
      const inside = distance <= body.extent;
      if (!inside && (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 + radiusX || Math.abs(projected.y) > 1 + radiusY)) continue;
      const dx = projected.x - (userZoom?.x ?? 0);
      const dy = projected.y - (userZoom?.y ?? 0);
      const normalized = Math.hypot(dx / radiusX, dy / radiusY);
      const screenDistance = inside ? 0 : Math.hypot(dx, dy) * Math.max(0, 1 - 1 / Math.max(1, normalized));
      if (!nearestGroup || screenDistance < nearestGroup.screenDistance || screenDistance === nearestGroup.screenDistance && distance < nearestDistance) {
        nearestGroup = { id: body.node.id, screenDistance };
        nearestDistance = distance;
      }
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
  function onVisibility() { pageVisible = !document.hidden; if (!pageVisible) { onWindowBlur(); destinationHover.clear(); guideButton.hidden = true; } pilot.setPaused(flightPaused || !pageVisible || !intersecting); stopFrame(); if (pageVisible) requestRender(); }
  function onMotion() {
    suppressCameraGestures();
    reducedMotion = motionQuery.matches;
    if (reducedMotion) finishEntityTransition();
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
  function onContextLost(event: Event) { event.preventDefault(); if (!unavailable) { suppressCameraGestures(); destinationHover.clear(); unavailable = true; stopFlight(); stopFrame(); callbacks.onUnavailable(); } }

  function restoreMapCamera() {
    let saved = flightMapPose;
    flightMapPose = null;
    if (!saved) return;
    if (tourPreparing) {
      // The pilot owns camera orientation, while OrbitControls still has its old target.
      // Retain the visible pose only for replay; ordinary flight exits restore the map.
      const position = camera.position.clone();
      const distance = Math.max(7, sceneRadius);
      const target = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(distance).add(position);
      saved = { position, target, framing: 0, focusPosition: null };
      focusedId = null;
      selectedId = null;
      focusDistance = undefined;
      overviewPose = null;
      controls.minDistance = Math.min(controls.minDistance, distance);
      controls.maxDistance = Math.max(controls.maxDistance, distance);
    }
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
      const visiblePose = tourPreparing ? pose() : null;
      const orientation = tourPreparing ? camera.quaternion.clone() : null;
      if (tourPreparing) controls.enableDamping = false;
      controls.update();
      if (visiblePose && orientation) {
        // Flush old control damping without changing the pilot's final frame.
        camera.position.copy(visiblePose.position);
        controls.target.copy(visiblePose.target);
        camera.quaternion.copy(orientation);
        controls.enableDamping = !reducedMotion;
      }
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
    suppressCameraGestures();
    starSelected = false;
    destinationHover.clear();
    clearZoomIntent();
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
    }).catch((error: unknown) => {
      if (destroyed || generation !== flightGeneration) return;
      reportError(error, "flight-load");
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

  const destinationHover = createDestinationHover({
    onChange: (id) => { if (id) { try { callbacks.onDestinationHover?.(id); } catch { /* Optional feedback cannot interrupt navigation. */ } } },
    camera, canvas, labelLayer,
    getHitTargets: () => hitTargets,
    resolve: (id) => {
      if (centralStar?.systemId === id) return { highlight: centralStar.highlight };
      const body = bodies.find((candidate) => candidate.node.id === id);
      return body?.highlight ? { highlight: body.highlight } : null;
    },
    requestRender,
  });

  controls.addEventListener("start", onControlStart);
  controls.addEventListener("end", onControlEnd);
  controls.addEventListener("change", requestRender);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("lostpointercapture", onLostPointerCapture);
  canvas.addEventListener("wheel", onWheelCapture, true);
  canvas.addEventListener("wheel", onWheel, { passive: true });
  labelLayer.addEventListener("wheel", onLabelWheel, { passive: false });
  canvas.addEventListener("webglcontextlost", onContextLost);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", onWindowBlur);
  motionQuery.addEventListener("change", onMotion);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    intersecting = entry.isIntersecting;
    if (!intersecting) { suppressCameraGestures(); destinationHover.clear(); guideButton.hidden = true; clearZoomIntent(); }
    pilot.setPaused(flightPaused || !pageVisible || !intersecting);
    stopFrame();
    if (intersecting) requestRender();
  });
  intersectionObserver.observe(container);
  resize();

  return {
    setView,
    setSelected,
    readCameraPose,
    restoreCamera,
    setStarSelected,
    setTourStep,
    setEntityTransition,
    setTourPreparing(value: boolean) { tourPreparing = value; if (value) { suppressCameraGestures(); clearCameraReport(); } },
    setAriaLabel(value: string) { canvas.setAttribute("aria-label", value); },
    setAutoOrbit(value: boolean) { autoOrbit = value; if (!value) controls.autoRotate = false; requestRender(); },
    setPlaying(value: boolean) {
      if (!value) suppressCameraGestures();
      if (!value) destinationHover.clear();
      if (!value) clearZoomIntent();
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
      requestCameraReport("manual");
      if (pilot.isActive()) return;
      finishWorldTransition();
      const focused = bodies.find((body) => body.node.id === focusedId);
      if (focused) focusBody(focused);
      else fit();
    },
    zoom(direction: "in" | "out") {
      if (destroyed || unavailable || !playing || pilot.isActive()) return;
      clearZoomIntent();
      cancelCameraTween();
      const offset = camera.position.clone().sub(controls.target);
      const distance = THREE.MathUtils.clamp(offset.length() * (direction === "in" ? 0.82 : 1.22), controls.minDistance, controls.maxDistance);
      if (isManualZoomSample(offset.length(), distance, true)) reportZoomIntent(direction);
      camera.position.copy(controls.target).add(offset.setLength(distance));
      controls.update();
      requestCameraReport("manual");
      requestRender();
    },
    destroy() {
      suppressCameraGestures();
      destroyed = true;
      clearCameraReport();
      finishEntityTransition(false);
      previousEntityAnchors.clear();
      destinationHover.dispose();
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
      window.removeEventListener("blur", onWindowBlur);
      motionQuery.removeEventListener("change", onMotion);
      controls.removeEventListener("start", onControlStart);
      controls.removeEventListener("end", onControlEnd);
      controls.removeEventListener("change", requestRender);
      controls.dispose();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointermove", onAfterControlPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("lostpointercapture", onLostPointerCapture);
      canvas.removeEventListener("wheel", onWheelCapture, true);
      canvas.removeEventListener("wheel", onWheel);
      labelLayer.removeEventListener("wheel", onLabelWheel);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      planetSelection.dispose();
      disposeObjects(scene, true);
      sphere.dispose();
      sharedMaps.forEach((map) => map.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      labelLayer.remove();
      bodies = []; labels = []; hitTargets = [];
    },
  };
}
