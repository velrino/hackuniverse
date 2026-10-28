import type { ReactNode } from "react";
import { AnchorLink } from "@/components/ui/anchor-link";
import type { DesignSystemCopy } from "../../messages";
import { sectionOrder } from "../../configs/showcase";

export function DesignSystemShell({ copy, children }: { copy: DesignSystemCopy; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-20">
      <header className="max-w-3xl">
        <p className="hud-kicker mb-4">{copy.eyebrow}</p>
        <h1 className="hud-title text-4xl sm:text-5xl">{copy.title}</h1>
        <p className="mt-5 text-base leading-8 text-[var(--hud-muted)]">{copy.description}</p>
      </header>
      <nav aria-label={copy.navigation} className="my-9 flex flex-wrap gap-x-6 gap-y-3 font-mono text-xs">
        {sectionOrder.map((id) => <AnchorLink key={id} href={`#${id}`} className="hud-nav-link py-2">{copy.sections[id]}</AnchorLink>)}
      </nav>
      <div className="grid gap-14">{children}</div>
    </main>
  );
}
