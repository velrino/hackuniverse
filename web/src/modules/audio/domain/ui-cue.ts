type ToggleState = "on" | "off";
type ControlState = { role: string | null; pressed: string | null; checked: string | null; destination: boolean; readOnly: boolean };

/** Read actual control semantics; selected destination labels are not toggles. */
export function audioToggleState({ role, pressed, checked, destination, readOnly }: ControlState): ToggleState | null {
  if (destination || readOnly) return null;
  const value = role === "switch" || role === "checkbox" ? checked : pressed;
  return value === "true" ? "on" : value === "false" ? "off" : null;
}

export function audioToggleCue(before: ToggleState, after: ToggleState | null, connected: boolean) {
  const next = connected ? after : before === "on" ? "off" : "on";
  return next && next !== before ? next === "on" ? "toggle-on" as const : "toggle-off" as const : null;
}
