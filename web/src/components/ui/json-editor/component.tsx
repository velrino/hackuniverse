"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JsonEditor as LibraryEditor, JsonEditorHandle, ThemeInput } from "json-edit-react";
import { Button } from "@/components/ui/button";
import type { JsonEditorProps } from "./types";
import { getEditingState } from "./editing-state";
import "./styles.css";

type LoadedEditor = { Editor: typeof LibraryEditor; theme: ThemeInput };

/** A controlled, lazily loaded JSON tree. Validation and storage belong to its caller. */
export function JsonEditor({ value, onChange, validate, parse, label, loadingLabel, loadErrorLabel, retryLabel, invalidValueLabel, translations, rootName, disabled = false, className, onError, onEditingChange }: JsonEditorProps) {
  const [loaded, setLoaded] = useState<LoadedEditor | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const accepted = useRef<object | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<JsonEditorHandle>(null);
  const editing = useRef(false);
  const editingCallback = useRef(onEditingChange);
  useEffect(() => { editingCallback.current = onEditingChange; }, [onEditingChange]);
  const reportEditing = useCallback((next: boolean) => {
    if (editing.current === next) return;
    editing.current = next;
    editingCallback.current?.(next);
  }, []);
  useEffect(() => () => { reportEditing(false); }, [reportEditing]);
  useEffect(() => {
    const cancelInlineEdit = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !editing.current || event.defaultPrevented) return;
      // Scope the key to this surface. Pending state comes only from the editor lifecycle API.
      const boundary = container.current?.closest('[role="dialog"], [role="alertdialog"]') ?? container.current;
      if (!boundary || !event.composedPath().includes(boundary)) return;
      // Radix listens on document capture, before a React key handler could cancel the field.
      event.preventDefault();
      event.stopImmediatePropagation();
      editor.current?.cancel();
      reportEditing(false);
    };
    window.addEventListener("keydown", cancelInlineEdit, true);
    return () => window.removeEventListener("keydown", cancelInlineEdit, true);
  }, [reportEditing]);
  useEffect(() => {
    let current = true;
    Promise.all([import("json-edit-react"), import("@json-edit-react/themes")]).then(([library, themes]) => {
      if (current) setLoaded({ Editor: library.JsonEditor, theme: themes.githubDarkTheme });
    }).catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [attempt]);

  const validInput = useMemo(() => {
    if (value === null || typeof value !== "object") return false;
    try { return validate(value) === undefined; }
    catch { return false; }
  }, [value, validate]);
  const reject = (candidate: unknown): string | undefined => {
    try {
      const result = validate(candidate);
      return result === undefined ? undefined : typeof result === "string" && result ? result : invalidValueLabel;
    } catch { return invalidValueLabel; }
  };
  useEffect(() => {
    if (!disabled && validInput) return;
    editor.current?.cancel();
    reportEditing(false);
  }, [disabled, validInput, reportEditing]);

  return <div ref={container} className={["json-editor", className].filter(Boolean).join(" ")} role="region" aria-label={label} tabIndex={0} aria-busy={validInput && !loaded && !failed}>
    {!validInput ? <p role="alert" className="json-editor__notice">{invalidValueLabel}</p> : failed ? <div className="json-editor__notice">
      <p role="alert">{loadErrorLabel}</p>
      <Button type="button" variant="outline" onClick={() => { setFailed(false); setAttempt((current) => current + 1); }}>{retryLabel}</Button>
    </div> : !loaded ? <p role="status" className="json-editor__notice">{loadingLabel}</p> : <loaded.Editor<object>
      data={value}
      editorRef={editor}
      onEditEvent={({ event }) => { reportEditing(getEditingState(editing.current, event)); }}
      setData={(next) => {
        // Only the exact document approved by the synchronous update gate can leave the editor.
        if (accepted.current !== next) return;
        accepted.current = null;
        onChange(next);
      }}
      onUpdate={({ newData }) => {
        accepted.current = null;
        if (disabled || newData === null || typeof newData !== "object") return { error: invalidValueLabel };
        const error = reject(newData);
        if (error) return { error };
        accepted.current = newData;
      }}
      jsonParse={(text) => {
        const node = parse(text);
        const error = reject(node);
        if (error) throw new Error(error);
        return node;
      }}
      onError={() => onError?.()}
      theme={loaded.theme}
      translations={translations}
      rootName={rootName}
      collapse={2}
      collapseAnimationTime={0}
      allowEdit={!disabled}
      allowAdd={!disabled}
      allowDelete={!disabled}
      allowTypeSelection={!disabled}
      allowDrag={false}
      showIconTooltips
      minWidth={0}
      maxWidth="100%"
      baseFontSize={14}
      className="json-editor__tree"
    />}
  </div>;
}
