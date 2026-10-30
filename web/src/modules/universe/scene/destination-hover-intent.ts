/** Audio intent follows physical pointer movement, independently of visual animation. */
export function createDestinationHoverIntent(onChange?: (id: string | null) => void) {
  let position: { x: number; y: number } | null = null;
  let pending = false;
  let destination: string | null = null;
  return {
    move(x: number, y: number, eligible: boolean) {
      if (!eligible) { pending = false; destination = null; return; }
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (position && Math.hypot(x - position.x, y - position.y) <= 0.25) return;
      position = { x, y }; pending = true;
    },
    target(id: string | null, enabled: boolean) {
      if (!enabled) { pending = false; destination = null; return; }
      if (!pending) return;
      pending = false;
      if (destination === id) return;
      destination = id;
      try { onChange?.(id); } catch { /* Feedback must not interrupt visual hover. */ }
    },
    clear() { position = null; pending = false; destination = null; },
  };
}
