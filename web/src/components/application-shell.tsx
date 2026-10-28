"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { brandName } from "@/configs/brand";
import { LocalizedLink, useTranslations } from "@/i18n";
import { LanguageSelector } from "@/i18n/language-selector";
import "./application-shell.css";

export function ApplicationShell({ children }: { children: ReactNode }) {
  const common = useTranslations("common");
  const pathname = usePathname();
  const fixedNavigation = pathname === "/design";
  const shellRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const navigation = [
    { href: "/", label: common.home },
    { href: "/example", label: common.example },
    { href: "/design", label: common.designSystem },
  ];

  useLayoutEffect(() => {
    const shell = shellRef.current;
    const header = headerRef.current;
    if (!fixedNavigation || !shell || !header) return;

    const updateHeight = () => {
      const height = header.getBoundingClientRect().height;
      if (height > 0) shell.style.setProperty("--application-header-height", `${height}px`);
    };
    updateHeight();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateHeight);
    observer?.observe(header);
    if (!observer) window.addEventListener("resize", updateHeight);

    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", updateHeight);
      shell.style.removeProperty("--application-header-height");
    };
  }, [fixedNavigation]);

  if (pathname === "/") return <>{children}</>;

  return (
    <div ref={shellRef} className={`hud-body flex min-h-dvh flex-col text-[var(--hud-text)]${fixedNavigation ? " application-shell--fixed-navigation" : ""}`}>
      <header ref={headerRef} className="application-shell__header shrink-0 border-b border-[var(--hud-line)] bg-[var(--hud-surface)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-5 py-4 sm:px-8">
          <LocalizedLink
            href="/"
            className="inline-flex items-center gap-3 text-sm font-semibold tracking-[0.12em] uppercase outline-none focus-visible:ring-2 focus-visible:ring-[var(--hud-accent)]"
          >
            <BrandLogo size={44} eager />
            <span>{brandName}</span>
          </LocalizedLink>
          <nav
            aria-label={common.navigation}
            className="order-3 flex w-full items-center gap-6 font-mono text-xs sm:order-none sm:ml-auto sm:w-auto"
          >
            {navigation.map((item) => (
              <LocalizedLink
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className="hud-nav-link py-2"
              >
                {item.label}
              </LocalizedLink>
            ))}
          </nav>
          <div className="ml-auto sm:ml-2">
            <LanguageSelector />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
