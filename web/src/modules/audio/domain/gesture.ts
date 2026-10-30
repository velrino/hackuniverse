type Gesture = { isTrusted: boolean; type: string; key?: string; repeat?: boolean; button?: number; pointerType?: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };
const passiveKeys = new Set(["Escape", "Shift", "Control", "Alt", "Meta", "CapsLock", "NumLock", "ScrollLock", "PrintScreen", "Unidentified"]);

/** Match activation-producing events; touch/pen activate on release, mouse on press. */
export function isAudioUnlockGesture(event: Gesture, silent: boolean, activation?: boolean) {
  if (!event.isTrusted || silent || activation === false) return false;
  if (event.type === "keydown") return !event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey && Boolean(event.key) && !passiveKeys.has(event.key!);
  if (event.button !== 0) return false;
  return event.type === "pointerdown" && event.pointerType === "mouse" || event.type === "pointerup" && event.pointerType !== "mouse";
}
