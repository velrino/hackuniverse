"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { assertTransferJsonStructure, parseWorkspaceJson, prepareWorkspaceImport, TransferValidationError, validateWorkspaceJson, workspaceDocument, workspaceLimits, type LocalWorkspace } from "../domain";
import { readWorkspaceJsonFile } from "../adapters/browser-json";
import type { WorkspaceCopy } from "../messages";

type ImportMode = "merge" | "replace";
type TransferError = keyof WorkspaceCopy["transfer"]["errors"];
const errorCode = (error: unknown): TransferError => error instanceof TransferValidationError ? error.code : "shape";
export function workspaceCounts(workspace: LocalWorkspace) {
  return { universes: workspace.universes.length, entities: workspace.universes.reduce((sum, item) => sum + item.entities.length, 0), planets: workspace.universes.reduce((sum, item) => sum + item.planets.length, 0) };
}

/** A detached import draft. Parsing and previewing never write browser storage. */
export function useJsonImport({ base, current, copy }: { base: LocalWorkspace; current: LocalWorkspace; copy: WorkspaceCopy }) {
  const [stage, setStage] = useState("source");
  const [text, setRawText] = useState("");
  const [draft, setDraft] = useState<object | null>(null);
  const [mode, changeMode] = useState<ImportMode>("merge");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<TransferError | "editor" | null>(null);
  const [reading, setReading] = useState(false);
  const operation = useRef(0);
  useEffect(() => () => { operation.current++; }, []);
  const stale = base !== current;
  const counts = workspaceCounts(base);
  const setText = (value: string) => {
    operation.current++;
    setReading(false); setDraft(null); setAcknowledged(false);
    if (value.length > workspaceLimits.bytes || new TextEncoder().encode(value).length > workspaceLimits.bytes) { setError("size"); return; }
    setRawText(value); setError(null);
  };
  const loadText = (value = text) => {
    setDraft(null); setAcknowledged(false);
    try {
      const incoming = parseWorkspaceJson(value);
      setRawText(value); setDraft(workspaceDocument(incoming)); setError(null); setStage("mode");
    } catch (failure) { setError(errorCode(failure)); setStage("source"); }
  };
  const loadFile = async (file: File) => {
    const next = ++operation.current;
    setReading(true); setRawText(""); setDraft(null); setAcknowledged(false); setError(null);
    try {
      const value = await readWorkspaceJsonFile(file);
      if (next === operation.current) loadText(value);
    } catch (failure) { if (next === operation.current) { setError(errorCode(failure)); setStage("source"); } }
    finally { if (next === operation.current) setReading(false); }
  };
  const preview = useMemo(() => {
    if (!draft) return null;
    let incoming: LocalWorkspace;
    try { incoming = validateWorkspaceJson(draft); }
    catch (failure) { return { incoming: null, result: null, error: errorCode(failure) }; }
    try { return { incoming, result: prepareWorkspaceImport(base, incoming, mode), error: null }; }
    catch (failure) { return { incoming, result: null, error: errorCode(failure) }; }
  }, [base, draft, mode]);
  const validate = (value: unknown): string | undefined => {
    try { assertTransferJsonStructure(value); }
    catch (failure) { return copy.transfer.errors[errorCode(failure)]; }
  };
  const changeDraft = (value: object) => { setDraft(value); setAcknowledged(false); setError(null); };
  const setMode = (value: ImportMode) => { changeMode(value); setAcknowledged(false); };
  const needsAcknowledgement = mode === "replace" && counts.entities > 0;
  return {
    stage, setStage, text, setText, draft, changeDraft, mode, setMode, acknowledged, setAcknowledged, preview,
    counts, stale, reading, loadText, loadFile, validate, needsAcknowledgement,
    editorError: () => setError("editor"),
    errorMessage: error ? error === "editor" ? copy.transfer.editorError : copy.transfer.errors[error] : null,
    canImport: Boolean(preview?.result && !stale && (!needsAcknowledgement || acknowledged)),
  };
}
