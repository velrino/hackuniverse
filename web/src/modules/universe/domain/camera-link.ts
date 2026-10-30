import type { NavigationTarget } from "./types";

export type UniverseCameraPose = Readonly<{
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}>;
export type UniverseCameraRestore = { token: string; target: NavigationTarget; pose: UniverseCameraPose };
export type CameraLinkSource = "demo" | "local";
export type CameraLinkResult =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "valid"; targetId: string; pose: UniverseCameraPose; source?: CameraLinkSource };

const maxCoordinate = 10_000_000;
const maxDistance = 20_000_000;
const minDistance = 0.001;
const maxCameraLength = 256;
const numericToken = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i;
const controls = /[\u0000-\u001f\u007f-\u009f]/u;
const isTargetId = (value: unknown): value is string => typeof value === "string" && value.length <= 256 && Boolean(value.trim()) && !controls.test(value);
const isSource = (value: unknown): value is CameraLinkSource => value === "demo" || value === "local";

function isVector(value: unknown): value is readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3 || Reflect.ownKeys(value).length !== 4) return false;
  for (let index = 0; index < 3; index++) {
    const field = Object.getOwnPropertyDescriptor(value, String(index));
    if (!field || !("value" in field) || typeof field.value !== "number" || !Number.isFinite(field.value) || Math.abs(field.value) > maxCoordinate) return false;
  }
  return true;
}

/** Coordinates are display units. The catalog and its target identity are validated separately. */
export function isCameraPose(value: unknown): value is UniverseCameraPose {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 2 || !keys.includes("position") || !keys.includes("target")) return false;
    const position = Object.getOwnPropertyDescriptor(value, "position");
    const target = Object.getOwnPropertyDescriptor(value, "target");
    if (!position || !("value" in position) || !target || !("value" in target) || !isVector(position.value) || !isVector(target.value)) return false;
    const distance = Math.hypot(...position.value.map((coordinate, index) => coordinate - target.value[index]));
    return distance >= minDistance && distance <= maxDistance;
  } catch { return false; }
}

function poseFromNumbers(numbers: readonly number[]): UniverseCameraPose {
  return Object.freeze({
    position: Object.freeze([numbers[0], numbers[1], numbers[2]] as const),
    target: Object.freeze([numbers[3], numbers[4], numbers[5]] as const),
  });
}

/** A camera link is complete and unambiguous; unrelated query parameters are ignored. */
export function readCameraLink(search: string): CameraLinkResult {
  if (typeof search !== "string") return { kind: "invalid" };
  const query = new URLSearchParams(search);
  const targets = query.getAll("target");
  const cameras = query.getAll("camera");
  const sources = query.getAll("source");
  if (sources.length > 1 || sources.length === 1 && !isSource(sources[0])) return { kind: "invalid" };
  if (!targets.length && !cameras.length) return { kind: "none" };
  if (targets.length !== 1 || cameras.length !== 1 || !isTargetId(targets[0]) || cameras[0].length > maxCameraLength) return { kind: "invalid" };
  const tokens = cameras[0].split(",");
  if (tokens.length !== 6 || tokens.some((token) => !numericToken.test(token))) return { kind: "invalid" };
  const pose = poseFromNumbers(tokens.map(Number));
  if (!isCameraPose(pose)) return { kind: "invalid" };
  return { kind: "valid", targetId: targets[0], pose, ...(sources.length ? { source: sources[0] as CameraLinkSource } : {}) };
}

/** Serialize a shareable HTTP URL without inheriting an implicit or stale source selection. */
export function buildCameraLinkUrl(href: string, targetId: string, pose: UniverseCameraPose, source?: CameraLinkSource): string | null {
  if (typeof href !== "string" || !isTargetId(targetId) || !isCameraPose(pose) || source !== undefined && !isSource(source)) return null;
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  if (!/^https?:$/u.test(url.protocol) || url.username || url.password) return null;
  const rounded = [...pose.position, ...pose.target].map((coordinate) => Number(coordinate.toFixed(6)));
  const canonical = poseFromNumbers(rounded);
  // Rounding must not collapse a valid eye/target separation or cross a bound.
  if (!isCameraPose(canonical)) return null;
  const camera = rounded.join(",");
  if (camera.length > maxCameraLength) return null;
  url.searchParams.set("target", targetId);
  // URLSearchParams replaces lone UTF-16 surrogates; never share a different catalog ID.
  if (url.searchParams.get("target") !== targetId) return null;
  url.searchParams.set("camera", camera);
  url.searchParams.delete("source");
  if (source !== undefined) url.searchParams.set("source", source);
  return url.href;
}
