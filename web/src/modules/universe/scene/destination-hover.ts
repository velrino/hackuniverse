import * as THREE from "three";
import { createDestinationHoverIntent } from "./destination-hover-intent";

export type Destination = { highlight: (active: boolean) => void };
type HoverOptions = {
  camera: THREE.Camera;
  canvas: HTMLCanvasElement;
  labelLayer: HTMLElement;
  getHitTargets: () => THREE.Object3D[];
  pick?: (pointer: THREE.Vector2) => string | null;
  resolve: (id: string) => Destination | null;
  requestRender: () => void;
  onChange?: (id: string | null) => void;
};

const labelSelector = "button.universe-node-label[data-destination-id]";

/** Resolve destinations and activate their existing materials without owning GPU resources. */
export function createDestinationHover({ camera, canvas, labelLayer, getHitTargets, pick, resolve, requestRender, onChange }: HoverOptions) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const intersections: THREE.Intersection[] = [];
  let pointerInside = false;
  let pressed = false;
  let label: HTMLButtonElement | null = null;
  let ownsCursor = false;
  let previousCursor = "";
  let disposed = false;
  let activeHighlight: Destination["highlight"] | null = null;
  const intent = createDestinationHoverIntent(onChange);

  function highlight(next: Destination["highlight"] | null = null) {
    if (activeHighlight === next) return;
    activeHighlight?.(false);
    activeHighlight = next;
    activeHighlight?.(true);
  }

  function cursor(hovered: boolean) {
    if (hovered) {
      if (!ownsCursor || canvas.style.cursor !== "pointer") previousCursor = canvas.style.cursor;
      canvas.style.cursor = "pointer";
      ownsCursor = true;
    } else {
      // Camera/flight code can change the cursor while hover is being suppressed.
      if (ownsCursor && canvas.style.cursor === "pointer") canvas.style.cursor = previousCursor;
      ownsCursor = false;
    }
  }

  function hide() {
    highlight();
    cursor(false);
  }

  function clear() {
    intent.clear();
    pointerInside = false;
    pressed = false;
    label = null;
    hide();
  }

  function supportsHover(event: PointerEvent) {
    return event.pointerType === "mouse" || event.pointerType === "pen";
  }

  function onPointerMove(event: PointerEvent) {
    if (event.type === "pointermove") intent.move(event.clientX, event.clientY, event.isTrusted && supportsHover(event) && event.buttons === 0);
    if (!supportsHover(event)) { clear(); requestRender(); return; }
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    pointerInside = true;
    pressed = event.buttons !== 0;
    if (pressed) hide();
    requestRender();
  }

  function onPointerDown(event: PointerEvent) {
    intent.clear();
    pressed = true;
    if (!supportsHover(event)) pointerInside = false;
    hide();
    requestRender();
  }

  function onPointerLeave() {
    intent.clear();
    pointerInside = false;
    hide();
    requestRender();
  }

  function onPointerCancel() { clear(); requestRender(); }

  function destinationLabel(target: EventTarget | null): HTMLButtonElement | null {
    if (!(target instanceof Element)) return null;
    const result = target.closest<HTMLButtonElement>(labelSelector);
    return result && labelLayer.contains(result) ? result : null;
  }

  function onLabelOver(event: PointerEvent) {
    if (!supportsHover(event) || event.buttons !== 0) { clear(); requestRender(); return; }
    pressed = false;
    label = destinationLabel(event.target);
    requestRender();
  }

  function onLabelOut(event: PointerEvent) {
    const next = destinationLabel(event.relatedTarget);
    if (next === label) return;
    label = next;
    hide();
    requestRender();
  }

  function onLabelMove(event: PointerEvent) {
    intent.move(event.clientX, event.clientY, event.isTrusted && supportsHover(event) && event.buttons === 0);
    requestRender();
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointercancel", onPointerCancel);
  labelLayer.addEventListener("pointerover", onLabelOver);
  labelLayer.addEventListener("pointerout", onLabelOut);
  labelLayer.addEventListener("pointermove", onLabelMove);

  return {
    update({ enabled, dragging }: { enabled: boolean; dragging: boolean }) {
      if (disposed) return;
      if (!enabled || dragging || pressed) { intent.target(null, false); hide(); return; }
      let destination: Destination | null = null;
      let destinationId: string | null = null;
      if (label && label.isConnected && !label.hidden && !label.disabled && !labelLayer.inert) {
        destinationId = label.dataset.destinationId ?? null;
        destination = resolve(destinationId ?? "");
      } else if (pointerInside) {
        if (pick) {
          destinationId = pick(pointer);
          destination = destinationId ? resolve(destinationId) : null;
        } else {
        camera.updateMatrixWorld();
        raycaster.setFromCamera(pointer, camera);
        intersections.length = 0;
        raycaster.intersectObjects(getHitTargets(), false, intersections);
        for (const hit of intersections) {
          if (typeof hit.object.userData.id !== "string") continue;
          destination = resolve(hit.object.userData.id);
          if (destination) { destinationId = hit.object.userData.id; break; }
        }
        }
      }
      if (!destination || typeof destination.highlight !== "function") { intent.target(null, true); hide(); return; }
      highlight(destination.highlight);
      intent.target(destinationId, true);
      cursor(true);
    },
    clear,
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      labelLayer.removeEventListener("pointerover", onLabelOver);
      labelLayer.removeEventListener("pointerout", onLabelOut);
      labelLayer.removeEventListener("pointermove", onLabelMove);
      intersections.length = 0;
    },
  };
}
