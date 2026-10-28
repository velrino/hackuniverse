import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type HudPanelProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "div";
};

/** A presentation-only frame. The decorative layers never clip its content. */
export function HudPanel({
  as: Element = "section",
  className,
  ...props
}: HudPanelProps) {
  return (
    <Element
      data-slot="hud-panel"
      className={cn("hud-panel", className)}
      {...props}
    />
  );
}
