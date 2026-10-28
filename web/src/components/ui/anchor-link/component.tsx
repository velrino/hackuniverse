import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type AnchorLinkProps = Omit<ComponentProps<"a">, "href"> & {
  href: `#${string}`;
};

/** Native fragment navigation preserves the current pathname and query. */
export function AnchorLink({ href, className, ...props }: AnchorLinkProps) {
  return (
    <a
      href={href}
      className={cn("outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background", className)}
      {...props}
    />
  );
}
