import { useEffect, useRef, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronsUp, Minus, Plus } from "lucide-react";
import type { ShipFlightInput } from "../../scene/flight/types";
import type { UniverseCopy } from "../../messages";

const empty: ShipFlightInput = { throttle: 0, turn: 0, lift: 0, boost: false };

export function FlightControls({ copy, onInput }: { copy: UniverseCopy; onInput: (input: ShipFlightInput) => void }) {
  const held = useRef(new Set<string>());
  const callback = useRef(onInput);
  useEffect(() => { callback.current = onInput; }, [onInput]);
  useEffect(() => {
    const clear = () => { held.current.clear(); callback.current(empty); };
    window.addEventListener("blur", clear);
    return () => { window.removeEventListener("blur", clear); clear(); };
  }, []);
  const change = (key: string, down: boolean) => {
    if (down) held.current.add(key); else held.current.delete(key);
    const has = (value: string) => Number(held.current.has(value));
    callback.current({ throttle: has("forward") - has("reverse"), turn: has("left") - has("right"), lift: has("up") - has("down"), boost: held.current.has("boost") });
  };
  const control = (key: string, label: string, icon: ReactNode) => <button type="button" aria-label={label} title={label} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); change(key, true); }} onPointerUp={() => change(key, false)} onPointerCancel={() => change(key, false)} onLostPointerCapture={() => change(key, false)} onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); change(key, true); } }} onKeyUp={() => change(key, false)}>{icon}</button>;
  return <div className="universe-flight-touch" role="group" aria-label={copy.enterFlight}><div className="universe-flight-pad">{control("forward", copy.thrust, <ArrowUp />)}<span />{control("left", copy.turnLeft, <ArrowLeft />)}{control("reverse", copy.reverse, <ArrowDown />)}{control("right", copy.turnRight, <ArrowRight />)}</div><div className="universe-flight-lift">{control("up", copy.ascend, <Plus />)}{control("down", copy.descend, <Minus />)}{control("boost", copy.boost, <ChevronsUp />)}</div></div>;
}
