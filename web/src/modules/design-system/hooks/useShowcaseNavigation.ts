"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { sectionOrder, type ShowcaseMode, type ShowcaseSectionId } from "../configs/showcase";

export function sectionFromHash(hash: string): ShowcaseSectionId | null {
  try {
    const value = decodeURIComponent(hash.replace(/^#/, ""));
    return sectionOrder.find((section) => section === value) ?? null;
  } catch { return null; }
}

/** Both presentations retain the same section tree and same-document fragments. */
export function useShowcaseNavigation() {
  const [mode, setMode] = useState<ShowcaseMode>("page");
  const [activeSection, setActiveSection] = useState<ShowcaseSectionId>(sectionOrder[0]);
  const [scrollRequest, setScrollRequest] = useState<{ section: ShowcaseSectionId; revision: number } | null>(null);
  const navigationRevision = useRef(0);
  const lastHash = useRef("");
  const tabListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    lastHash.current = window.location.hash;
    const initialHash = lastHash.current;
    const revision = navigationRevision.current;
    const initial = sectionFromHash(lastHash.current);
    queueMicrotask(() => {
      if (current && initial && revision === navigationRevision.current && window.location.hash === initialHash) setActiveSection(initial);
    });

    const synchronize = () => {
      const hash = window.location.hash;
      const changed = hash !== lastHash.current;
      lastHash.current = hash;
      if (!changed) return;
      const section = sectionFromHash(hash);
      if (!section) return;
      const revision = ++navigationRevision.current;
      setActiveSection(section);
      if (mode === "tabs") setScrollRequest({ section, revision });
    };
    window.addEventListener("hashchange", synchronize);
    window.addEventListener("popstate", synchronize);
    return () => {
      current = false;
      window.removeEventListener("hashchange", synchronize);
      window.removeEventListener("popstate", synchronize);
    };
  }, [mode]);

  useEffect(() => {
    if (!scrollRequest) return;
    const frame = requestAnimationFrame(() => {
      const section = document.getElementById(scrollRequest.section);
      if (scrollRequest.revision === navigationRevision.current && section && !section.closest("[hidden]")) {
        section.scrollIntoView({ block: "start", behavior: "auto" });
        section.focus({ preventScroll: true });
      }
      setScrollRequest((current) => current === scrollRequest ? null : current);
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollRequest, mode, activeSection]);

  useEffect(() => {
    const list = tabListRef.current;
    if (mode !== "tabs" || !list) return;
    const trigger = list.querySelector<HTMLElement>(`[data-section="${activeSection}"]`);
    if (!trigger) return;
    const strip = list.parentElement;
    if (!strip) return;
    const left = trigger.offsetLeft - 6;
    const right = trigger.offsetLeft + trigger.offsetWidth + 6;
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
  }, [activeSection, mode]);

  const changeMode = useCallback((next: ShowcaseMode) => {
    navigationRevision.current++;
    setScrollRequest(null);
    if (next === "tabs") {
      const section = sectionFromHash(window.location.hash);
      if (section) setActiveSection(section);
    }
    setMode(next);
  }, []);

  const changeSection = useCallback((value: string) => {
    const section = sectionOrder.find((id) => id === value);
    if (!section) return;
    navigationRevision.current++;
    setScrollRequest(null);
    setActiveSection(section);
    const hash = `#${section}`;
    lastHash.current = hash;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${hash}`);
  }, []);

  const onAnchorClick = useCallback((event: MouseEvent<HTMLElement>) => {
    if (mode !== "tabs" || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
    if (!anchor || anchor.hasAttribute("download") || anchor.target && anchor.target !== "_self") return;
    const section = sectionFromHash(anchor.getAttribute("href") ?? "");
    if (!section) return;
    event.preventDefault();
    const revision = ++navigationRevision.current;
    const hash = `#${section}`;
    if (window.location.hash !== hash) {
      window.history.pushState(window.history.state, "", `${window.location.pathname}${window.location.search}${hash}`);
    }
    lastHash.current = hash;
    setActiveSection(section);
    // The effect scrolls only after the requested panel is visible.
    setScrollRequest({ section, revision });
  }, [mode]);

  const onTabListMount = useCallback((element: HTMLDivElement | null) => { tabListRef.current = element; }, []);

  return { mode, activeSection, changeMode, changeSection, onAnchorClick, onTabListMount };
}
