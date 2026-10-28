import * as THREE from "three";

export type Destination = { position: THREE.Vector3; extent: number; highlight?: (active: boolean) => void };
type HoverOptions = {
  scene: THREE.Scene;
  camera: THREE.Camera;
  canvas: HTMLCanvasElement;
  labelLayer: HTMLElement;
  map: THREE.Texture;
  getHitTargets: () => THREE.Object3D[];
  resolve: (id: string) => Destination | null;
  requestRender: () => void;
};

const labelSelector = "button.universe-node-label[data-destination-id]";

/** One decorative aura; it never changes selection or owns the shared glow map. */
export function createDestinationHover({ scene, camera, canvas, labelLayer, map, getHitTargets, resolve, requestRender }: HoverOptions) {
  const material = new THREE.SpriteMaterial({ map, color: 0x53e4ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const aura = new THREE.Sprite(material);
  aura.name = "destination-hover";
  aura.renderOrder = 4;
  aura.visible = false;
  scene.add(aura);
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

  function highlight(next: Destination["highlight"] = undefined) {
    if (activeHighlight === (next ?? null)) return;
    activeHighlight?.(false);
    activeHighlight = next ?? null;
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
    aura.visible = false;
    cursor(false);
  }

  function clear() {
    pointerInside = false;
    pressed = false;
    label = null;
    hide();
  }

  function supportsHover(event: PointerEvent) {
    return event.pointerType === "mouse" || event.pointerType === "pen";
  }

  function onPointerMove(event: PointerEvent) {
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
    pressed = true;
    if (!supportsHover(event)) pointerInside = false;
    hide();
    requestRender();
  }

  function onPointerLeave() {
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

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointercancel", onPointerCancel);
  labelLayer.addEventListener("pointerover", onLabelOver);
  labelLayer.addEventListener("pointerout", onLabelOut);

  return {
    update({ enabled, dragging }: { enabled: boolean; dragging: boolean }) {
      if (disposed) return;
      if (!enabled || dragging || pressed) { hide(); return; }
      let destination: Destination | null = null;
      if (label && label.isConnected && !label.hidden && !label.disabled && !labelLayer.inert) {
        destination = resolve(label.dataset.destinationId ?? "");
      } else if (pointerInside) {
        camera.updateMatrixWorld();
        raycaster.setFromCamera(pointer, camera);
        intersections.length = 0;
        raycaster.intersectObjects(getHitTargets(), false, intersections);
        for (const hit of intersections) {
          if (typeof hit.object.userData.id !== "string") continue;
          destination = resolve(hit.object.userData.id);
          if (destination) break;
        }
      }
      if (!destination || !Number.isFinite(destination.extent) || destination.extent <= 0) { hide(); return; }
      highlight(destination.highlight);
      aura.visible = !destination.highlight;
      if (!destination.highlight) {
        aura.position.copy(destination.position);
        aura.scale.setScalar(destination.extent * 4.2);
      }
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
      scene.remove(aura);
      material.dispose();
      intersections.length = 0;
    },
  };
}
