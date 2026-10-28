import * as THREE from "three";
import { createEnginePlume } from "./engine-plume";
import type { ShipAutopilotEnd, ShipFlightInput, ShipObstacle, ShipPilot, ShipPilotOptions } from "./types";

const SHIP_URL = "/models/space-ship.glb";
const SHIP_SPAN = 0.375;
const SHIP_RADIUS = 0.225;
const KEYS = new Set(["KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE", "ShiftLeft", "ShiftRight"]);
const EMPTY_INPUT: ShipFlightInput = { throttle: 0, turn: 0, lift: 0, boost: false };
const axis = (value: number) => Number.isFinite(value) ? THREE.MathUtils.clamp(value, -1, 1) : 0;
const damp = (current: number, target: number, rate: number, delta: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-rate * delta));
const validObstacle = (body: ShipObstacle | undefined): body is ShipObstacle => Boolean(body &&
  Number.isFinite(body.radius) && body.radius > 0 && Number.isFinite(body.position.x) &&
  Number.isFinite(body.position.y) && Number.isFinite(body.position.z));

/** Every decoded resource belongs to this one flight session, including ImageBitmaps. */
function disposeAsset(roots: readonly THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const bitmaps = new Set<ImageBitmap>();
  for (const root of roots) root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const values = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of values) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  for (const texture of textures) {
    const image: unknown = texture.source.data;
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) bitmaps.add(image);
    texture.dispose();
  }
  for (const bitmap of bitmaps) bitmap.close();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

function blocksInput(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(
    'input,textarea,select,a,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="searchbox"],[role="combobox"],[role="spinbutton"],[role="dialog"],[role="alertdialog"]',
  ));
}

export function createShipPilot(options: ShipPilotOptions): ShipPilot {
  const { scene, camera, canvas } = options;
  const ship = new THREE.Group();
  const attitude = new THREE.Group();
  ship.add(attitude);
  const held = new Set<string>();
  const forward = new THREE.Vector3();
  const candidate = new THREE.Vector3();
  const collisionNormal = new THREE.Vector3();
  const desiredCamera = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const spawnPoint = new THREE.Vector3();
  const goal = new THREE.Vector3();
  const route = new THREE.Vector3();
  const alongRoute = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const autoInput = { ...EMPTY_INPUT };
  let plume: ReturnType<typeof createEnginePlume> | null = null;
  let autopilot: (() => ShipObstacle | undefined) | null = null;
  let autopilotTime = 0;
  let autopilotStall = 0;
  let bestRange = Infinity;
  let autopilotStepLimit = Infinity;
  let assetRoots: THREE.Object3D[] = [];
  let external = { ...EMPTY_INPUT };
  let active = false;
  let paused = false;
  let disposed = false;
  let loaded = false;
  let windowFocused = true;
  let generation = 0;
  let request: AbortController | null = null;
  let pending: Promise<boolean> | null = null;
  let speed = 0;
  let climb = 0;
  let turnRate = 0;
  let yaw = 0;
  let originalTabIndex: string | null = null;
  let ownsTabIndex = false;

  function radius() {
    const value = options.getSystemRadius();
    return Number.isFinite(value) && value > 0 ? Math.max(12, value) : 40;
  }

  function obstacles() {
    return options.getObstacles();
  }

  function safe(point: THREE.Vector3, bodies: readonly ShipObstacle[]) {
    return bodies.every((body) => !validObstacle(body) || point.distanceToSquared(body.position) > (body.radius + SHIP_RADIUS + 1.5) ** 2);
  }

  function findSpawn(anchor?: THREE.Vector3) {
    const bound = radius();
    const bodies = obstacles();
    const heading = Math.atan2(camera.position.x, camera.position.z);
    const preferred = anchor ?? options.getSpawnAnchor?.();
    const height = Math.min(6, bound * 0.15);
    for (let attempt = 0; attempt < 48; attempt++) {
      const angle = heading + attempt * 2.399963;
      const ring = bound * (attempt < 24 ? 0.78 : 0.58);
      candidate.set(Math.sin(angle) * ring, height + Math.floor(attempt / 16) * 2, Math.cos(angle) * ring);
      if (preferred && attempt < 8) {
        candidate.lerp(preferred, 0.2);
        candidate.y = Math.max(height, candidate.y);
      }
      if (safe(candidate, bodies)) return spawnPoint.copy(candidate);
    }
    // A clear elevated fallback keeps even crowded systems local and outside the star.
    candidate.set(0, bound * 0.8, 0);
    if (safe(candidate, bodies)) return spawnPoint.copy(candidate);
    throw new Error("No safe ship spawn is available in this system.");
  }

  function clearInput() {
    held.clear();
    external = { ...EMPTY_INPUT };
    speed = 0;
    climb = 0;
    turnRate = 0;
  }

  function endAutopilot(reason: ShipAutopilotEnd, notify = true) {
    if (!autopilot) return;
    autopilot = null;
    autopilotStepLimit = Infinity;
    clearInput();
    if (notify) options.onAutopilotEnd?.(reason);
  }

  function guidance(delta: number): ShipFlightInput | null {
    if (!autopilot) return null;
    const target = autopilot();
    if (!validObstacle(target) || target.position.length() > radius()) {
      endAutopilot("unavailable");
      return null;
    }
    const range = ship.position.distanceTo(target.position);
    const standoff = target.radius + SHIP_RADIUS + 1.15;
    if (range <= standoff + 0.4) {
      endAutopilot("arrived");
      return null;
    }
    autopilotTime += delta;
    autopilotStall += delta;
    if (range < bestRange - 0.15) { bestRange = range; autopilotStall = 0; }
    if (autopilotStall > 20 || autopilotTime > Math.max(40, radius() * 5)) {
      endAutopilot("unavailable");
      return null;
    }
    goal.copy(target.position);
    route.subVectors(goal, ship.position);
    const routeLengthSq = route.lengthSq();
    let closest = Infinity;
    // One elevated waypoint clears the nearest sphere intersecting the direct route.
    // Re-evaluating the segment follows orbiting bodies without storing stale poses.
    for (const body of obstacles()) {
      if (!validObstacle(body) || body.position.distanceToSquared(target.position) < 0.000001) continue;
      offset.subVectors(body.position, ship.position);
      const t = offset.dot(route) / routeLengthSq;
      if (t <= 0 || t >= 1 || t >= closest) continue;
      alongRoute.copy(ship.position).addScaledVector(route, t);
      const clearance = body.radius + SHIP_RADIUS + 1;
      if (alongRoute.distanceToSquared(body.position) < clearance ** 2) {
        closest = t;
        goal.copy(body.position);
        goal.y += clearance + 2;
      }
    }
    offset.subVectors(goal, ship.position);
    const desiredYaw = Math.atan2(-offset.x, -offset.z);
    const error = THREE.MathUtils.euclideanModulo(desiredYaw - yaw + Math.PI, Math.PI * 2) - Math.PI;
    const horizontal = Math.hypot(offset.x, offset.z);
    const alignment = Math.max(0, Math.cos(error));
    const approach = closest < Infinity ? Math.min(1, horizontal * 0.7) : Math.min(1, Math.max(0, range - standoff) * 0.7);
    autopilotStepLimit = closest < Infinity ? Infinity : Math.max(0, range - standoff);
    autoInput.throttle = approach * alignment * alignment;
    autoInput.turn = horizontal < 0.05 ? 0 : axis(error / 0.65);
    autoInput.lift = axis(offset.y * 0.9);
    autoInput.boost = false;
    return autoInput;
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!active || !loaded || paused || !windowFocused || document.hidden || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || blocksInput(event.target) || !KEYS.has(event.code)) return;
    // A held key cannot restart movement after a modal, blur or visibility reset.
    if (event.repeat && !held.has(event.code)) return;
    endAutopilot("manual");
    held.add(event.code);
    event.preventDefault();
  }

  function onKeyUp(event: KeyboardEvent) { held.delete(event.code); }
  function onVisibility() { clearInput(); }
  function onBlur() { windowFocused = false; clearInput(); }
  function onWindowFocus() { windowFocused = true; clearInput(); }
  function onFocus(event: FocusEvent) { if (blocksInput(event.target)) clearInput(); }
  function onContextLost() { clearInput(); }

  function listen() {
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("focusin", onFocus);
    canvas.addEventListener("webglcontextlost", onContextLost);
  }

  function unlisten() {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onWindowFocus);
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("focusin", onFocus);
    canvas.removeEventListener("webglcontextlost", onContextLost);
  }

  function chase(delta: number, snap = false) {
    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    const portrait = camera.aspect < 0.85;
    desiredCamera.copy(ship.position).addScaledVector(forward, portrait ? -6 : -5);
    desiredCamera.y += portrait ? 3.2 : 2.2;
    desiredLook.copy(ship.position).addScaledVector(forward, 3.8);
    desiredLook.y += 0.3;
    const smoothing = snap || options.reducedMotion?.() ? 1 : 1 - Math.exp(-7 * delta);
    camera.position.lerp(desiredCamera, smoothing);
    lookTarget.lerp(desiredLook, smoothing);
    camera.lookAt(lookTarget);
  }

  function releaseAsset() {
    ship.removeFromParent();
    attitude.clear();
    plume?.dispose();
    plume = null;
    disposeAsset(assetRoots);
    assetRoots = [];
    loaded = false;
  }

  function exit(notify = true) {
    const wasActive = active;
    active = false;
    endAutopilot("cancelled", notify);
    generation++;
    request?.abort();
    request = null;
    pending = null;
    clearInput();
    unlisten();
    releaseAsset();
    if (ownsTabIndex) {
      if (originalTabIndex === null) canvas.removeAttribute("tabindex");
      else canvas.setAttribute("tabindex", originalTabIndex);
      ownsTabIndex = false;
    }
    if (wasActive && notify) options.onExit?.();
  }

  async function load(token: number, abort: AbortController, anchor?: THREE.Vector3) {
    let decoded: THREE.Object3D[] = [];
    try {
      const response = await fetch(SHIP_URL, { signal: abort.signal });
      if (!response.ok) throw new Error("The ship model could not be loaded.");
      const bytes = await response.arrayBuffer();
      if (!active || disposed || generation !== token || abort.signal.aborted) return false;
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      if (!active || disposed || generation !== token || abort.signal.aborted) return false;
      const gltf = await new GLTFLoader().parseAsync(bytes, "/models/");
      decoded = gltf.scenes.length ? gltf.scenes : [gltf.scene];
      if (!active || disposed || generation !== token || abort.signal.aborted) {
        disposeAsset(decoded);
        return false;
      }
      const aligned = new THREE.Group();
      // Align the supplied model's nose axis with -Z without changing source bytes.
      aligned.rotation.y = -Math.PI / 2;
      aligned.add(gltf.scene);
      aligned.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(aligned);
      const size = bounds.getSize(new THREE.Vector3());
      const span = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(span) || span <= 0) throw new Error("The ship model has invalid bounds.");
      const scale = SHIP_SPAN / span;
      aligned.position.copy(bounds.getCenter(new THREE.Vector3())).multiplyScalar(-scale);
      aligned.scale.setScalar(scale);
      ship.position.copy(findSpawn(anchor));
      yaw = Math.atan2(-ship.position.x, -ship.position.z) + Math.PI;
      ship.rotation.set(0, yaw, 0);
      attitude.rotation.set(0, 0, 0);
      attitude.add(aligned);
      plume = createEnginePlume();
      attitude.add(plume.object);
      assetRoots = decoded;
      decoded = [];
      scene.add(ship);
      loaded = true;
      request = null;
      originalTabIndex = canvas.getAttribute("tabindex");
      ownsTabIndex = true;
      canvas.tabIndex = -1;
      if (!paused && !document.hidden) canvas.focus({ preventScroll: true });
      if (!paused && !document.hidden) chase(0, true);
      return true;
    } catch (error) {
      if (decoded.length) disposeAsset(decoded);
      if (disposed || generation !== token || abort.signal.aborted) return false;
      exit();
      throw error;
    } finally {
      if (generation === token) pending = null;
    }
  }

  return {
    enter({ anchor } = {}) {
      if (disposed) return Promise.resolve(false);
      if (active) return pending ?? Promise.resolve(loaded);
      active = true;
      windowFocused = true;
      clearInput();
      listen();
      const token = ++generation;
      request = new AbortController();
      pending = load(token, request, anchor?.clone());
      return pending;
    },
    exit() { exit(); },
    isActive() { return active; },
    setPaused(value) {
      paused = value;
      if (paused) clearInput();
    },
    setInput(input) {
      const next = !active || paused || !windowFocused || document.hidden ? EMPTY_INPUT : {
        throttle: axis(input.throttle), turn: axis(input.turn), lift: axis(input.lift), boost: Boolean(input.boost),
      };
      if (next.throttle || next.turn || next.lift || next.boost) endAutopilot("manual");
      external = { ...next };
    },
    setAutopilotTarget(getTarget) {
      if (!getTarget) { endAutopilot("cancelled"); return; }
      if (!active || disposed) return;
      clearInput();
      autopilot = getTarget;
      autopilotTime = 0;
      autopilotStall = 0;
      bestRange = Infinity;
      autopilotStepLimit = Infinity;
    },
    update(elapsed) {
      if (!active || !loaded || paused || !windowFocused || disposed || document.hidden) return;
      const delta = Number.isFinite(elapsed) ? THREE.MathUtils.clamp(elapsed, 0, 0.05) : 0;
      if (!delta) return;
      const controls = guidance(delta) ?? external;
      const throttle = axis(controls.throttle + Number(held.has("KeyW")) - Number(held.has("KeyS")));
      const turn = axis(controls.turn + Number(held.has("KeyA")) - Number(held.has("KeyD")));
      const lift = axis(controls.lift + Number(held.has("KeyE")) - Number(held.has("KeyQ")));
      const boost = controls.boost || held.has("ShiftLeft") || held.has("ShiftRight");
      speed = damp(speed, throttle * (boost ? 5 : 2), 4, delta);
      climb = damp(climb, lift * (boost ? 2 : 1.2), 5, delta);
      turnRate = damp(turnRate, turn * 0.9, 7, delta);
      yaw = THREE.MathUtils.euclideanModulo(yaw + turnRate * delta + Math.PI, Math.PI * 2) - Math.PI;
      forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      candidate.copy(ship.position).addScaledVector(forward, Math.min(speed * delta, autopilotStepLimit));
      candidate.y += climb * delta;
      const bound = radius();
      // A soft outer steering assist and a hard local bound prevent physical map travel.
      const distance = candidate.length();
      if (distance > bound * 0.88) candidate.multiplyScalar(THREE.MathUtils.lerp(1, bound * 0.88 / distance, Math.min(1, delta * 3)));
      if (candidate.length() > bound) { candidate.setLength(bound); speed *= 0.5; }
      for (const body of obstacles()) {
        if (!validObstacle(body)) continue;
        const clearance = body.radius + SHIP_RADIUS + 0.3;
        collisionNormal.subVectors(candidate, body.position);
        if (collisionNormal.lengthSq() < clearance ** 2) {
          if (collisionNormal.lengthSq() < 0.000001) collisionNormal.set(0, 1, 0);
          candidate.copy(body.position).addScaledVector(collisionNormal.normalize(), clearance);
          speed *= 0.25;
          climb *= 0.25;
        }
      }
      if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y) || !Number.isFinite(candidate.z) || candidate.length() > bound * 1.2) {
        candidate.copy(findSpawn());
        clearInput();
      }
      ship.position.copy(candidate);
      ship.rotation.y = yaw;
      const quiet = options.reducedMotion?.();
      attitude.rotation.z = damp(attitude.rotation.z, quiet ? 0 : -turnRate * 0.13, 6, delta);
      attitude.rotation.x = damp(attitude.rotation.x, quiet ? 0 : -lift * 0.07, 6, delta);
      plume?.update(delta, throttle, boost, Boolean(quiet));
      chase(delta);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      exit(false);
    },
  };
}
