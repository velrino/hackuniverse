"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { readCameraLink, type EntityKind, type NavigationTarget, type UniverseEntity } from "@/modules/universe/domain";
import type { UniverseEntityTransition } from "@/modules/universe";
import { createWorkspaceEntity, deleteWorkspaceEntity, prepareWorkspaceImport, TransferValidationError, updateWorkspaceEntity, WorkspaceValidationError, type EntityDraft, type LocalWorkspace } from "../domain";
import { downloadWorkspaceJson } from "../adapters/browser-json";
import { useLocalWorkspace } from "./use-local-workspace";
import { useDataSource } from "./use-data-source";
import type { WorkspaceCopy } from "../messages";
import { getEditorParentSuggestions } from "../configs/editor-context";

type EditorSession = { entity?: UniverseEntity; parentSuggestions?: Partial<Record<EntityKind, string>>; base: LocalWorkspace; kind: EntityKind };
type DeleteSession = { entity: UniverseEntity; base: LocalWorkspace; next: LocalWorkspace; count: number };
type PendingTransition = { command: UniverseEntityTransition; deletion?: DeleteSession };
const token = () => crypto.randomUUID();

/** Browser workspace orchestration; the renderer receives only catalog and presentation commands. */
export function useWorkspaceSession(copy: WorkspaceCopy) {
  const local = useLocalWorkspace();
  const { source, setSource } = useDataSource();
  const [editor, setEditor] = useState<EditorSession | null>(null);
  const [deletion, setDeletion] = useState<DeleteSession | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [transfer, setTransfer] = useState<LocalWorkspace | null>(null);
  const [transferMessage, setTransferMessage] = useState<"exported" | "exportError" | null>(null);
  const managerTarget = useRef<NavigationTarget | undefined>(undefined);
  const [floatOpen, setFloatOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [notice, setNotice] = useState<"created" | "updated" | "deleted" | "imported" | null>(null);
  const [pending, setPending] = useState<PendingTransition | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const finishing = useRef<string | null>(null);
  const [navigationRequest, setNavigationRequest] = useState<{ token: string; target: NavigationTarget }>();
  const linkedLocalTarget = useRef<{ targetId: string } | null>(null);
  const resolvingLocalLink = useRef(false);
  const attemptedLocalLink = useRef<{ request: object; workspace: LocalWorkspace } | null>(null);
  const [linkRevision, setLinkRevision] = useState(0);
  const { ready: localReady, workspace: localWorkspace, selectUniverse: selectLocalUniverse } = local;
  const catalog = local.workspace.universes.find((item) => item.rootId === local.workspace.activeUniverseId);
  const restoreCameraSource = useEffectEvent(() => {
    const link = readCameraLink(window.location.search);
    linkedLocalTarget.current = null;
    if (link.kind !== "valid" || !link.source) return;
    setSource(link.source);
    if (link.source !== "local") return;
    linkedLocalTarget.current = { targetId: link.targetId };
    setLinkRevision((value) => value + 1);
  });
  useEffect(() => {
    if (!local.ready) return;
    const restoreSource = () => restoreCameraSource();
    restoreSource();
    window.addEventListener("popstate", restoreSource);
    return () => window.removeEventListener("popstate", restoreSource);
  }, [local.ready]);
  useEffect(() => {
    const request = linkedLocalTarget.current;
    if (!localReady || source !== "local" || !request || resolvingLocalLink.current) return;
    const destination = localWorkspace.universes.find((universe) => universe.entities.some((entity) => entity.id === request.targetId));
    if (!destination || destination.rootId === localWorkspace.activeUniverseId) { linkedLocalTarget.current = null; return; }
    if (attemptedLocalLink.current?.request === request && attemptedLocalLink.current.workspace === localWorkspace) return;
    attemptedLocalLink.current = { request, workspace: localWorkspace };
    resolvingLocalLink.current = true;
    // Reconcile the newest URL only after the previous selection settles. A
    // rapid Back/Forward sequence must not enqueue writes with stale baselines.
    void selectLocalUniverse(destination.rootId).catch(() => setFormError(copy.invalidError)).finally(() => {
      resolvingLocalLink.current = false;
      setLinkRevision((value) => value + 1);
    });
  }, [localReady, localWorkspace, selectLocalUniverse, source, copy.invalidError, linkRevision]);
  const findEntity = (target: NavigationTarget) => source === "local" ? catalog?.entities.find((item) => item.id === target.id && item.kind === target.kind) : undefined;
  const clearFormError = () => setFormError(undefined);
  const errorText = (error: unknown) => error instanceof WorkspaceValidationError && error.code === "limit" ? copy.limitError : copy.invalidError;
  const selectUniverse = async (id: string): Promise<boolean> => {
    clearFormError();
    try { return await local.selectUniverse(id); }
    catch (error) { setFormError(errorText(error)); return false; }
  };
  const openCreate = (target?: NavigationTarget, kind: EntityKind = "planet") => {
    if (!local.ready || pending) return;
    const parentSuggestions = source === "local" ? getEditorParentSuggestions(catalog, target) : {};
    setEditor({ base: local.workspace, kind, parentSuggestions });
    setManagerOpen(false); setFloatOpen(false); clearFormError();
  };
  const openManager = (target?: NavigationTarget) => {
    if (!local.ready || pending) return;
    managerTarget.current = source === "local" ? target : undefined;
    setSource("local"); setManagerOpen(true); setFloatOpen(false); setTransferMessage(null); clearFormError();
  };
  const openImport = () => {
    if (!local.ready || pending || savingRef.current) return;
    setTransfer(local.workspace); setManagerOpen(false); setFloatOpen(false); clearFormError(); setTransferMessage(null);
  };
  const exportJson = () => {
    if (!local.ready || pending || savingRef.current) return;
    try { downloadWorkspaceJson(local.workspace); setTransferMessage("exported"); }
    catch { setTransferMessage("exportError"); }
  };
  const importJson = async (incoming: LocalWorkspace, mode: "merge" | "replace", confirmed: boolean): Promise<boolean> => {
    if (!transfer || pending || savingRef.current) return false;
    if (transfer !== local.workspace) { setFormError(copy.storageErrors.conflict); return false; }
    if (mode === "replace" && transfer.universes.some((item) => item.entities.length > 0) && !confirmed) return false;
    savingRef.current = true; setSaving(true); clearFormError();
    try {
      const next = prepareWorkspaceImport(local.workspace, incoming, mode);
      if (!await local.commit(next)) return false;
      if (mode === "replace" || !transfer.activeUniverseId) {
        const destination = next.universes.find((item) => item.rootId === next.activeUniverseId);
        setNavigationRequest(destination ? { token: token(), target: destination.initialTarget } : undefined);
      }
      setSource("local"); setTransfer(null); setManagerOpen(true); setNotice("imported");
      return true;
    } catch (error) {
      setFormError(error instanceof TransferValidationError ? copy.transfer.errors[error.code] : copy.invalidError);
      return false;
    } finally { savingRef.current = false; setSaving(false); }
  };
  const openEdit = (entity: UniverseEntity) => {
    if (source !== "local" || pending) return;
    setEditor({ base: local.workspace, kind: entity.kind, entity });
    setManagerOpen(false); setFloatOpen(false); clearFormError();
  };
  const openDelete = (entity: UniverseEntity) => {
    if (source !== "local" || pending) return;
    try {
      const next = deleteWorkspaceEntity(local.workspace, entity.id);
      const size = (workspace: LocalWorkspace) => workspace.universes.reduce((sum, universe) => sum + universe.entities.length, 0);
      setDeletion({ entity, base: local.workspace, next, count: size(local.workspace) - size(next) });
      setManagerOpen(false); setFloatOpen(false); clearFormError();
    } catch (error) { setFormError(errorText(error)); }
  };
  const navigate = (id: string) => {
    const entity = catalog?.entities.find((item) => item.id === id);
    if (entity) { setNavigationRequest({ token: token(), target: { id, kind: entity.kind } }); setManagerOpen(false); }
  };
  const submit = async (draft: EntityDraft) => {
    if (!editor || pending || savingRef.current) return;
    if (editor.base !== local.workspace) { setFormError(copy.storageErrors.conflict); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      const created = editor.entity ? null : createWorkspaceEntity(local.workspace, draft, copy.defaults);
      const next = editor.entity ? updateWorkspaceEntity(local.workspace, editor.entity.id, draft) : created!.workspace;
      if (!await local.commit(next)) return;
      const target = created?.target ?? { id: editor.entity!.id, kind: editor.entity!.kind };
      setSource("local");
      setNavigationRequest({ token: token(), target });
      setEditor(null); clearFormError(); setNotice(created ? "created" : "updated");
      if (created) setPending({ command: { token: token(), action: "create", kind: target.kind, entityId: target.id } });
    } catch (error) { setFormError(errorText(error)); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const confirmDelete = () => {
    if (!deletion || pending) return;
    if (deletion.base !== local.workspace) { setFormError(copy.storageErrors.conflict); return; }
    setPending({ command: { token: token(), action: "delete", entityId: deletion.entity.id, kind: deletion.entity.kind, variant: crypto.getRandomValues(new Uint8Array(1))[0] % 2 ? "collapse" : "burst" }, deletion });
    setDeletion(null); clearFormError();
  };
  const finishTransition = useCallback(async (completed: string) => {
    if (!pending || pending.command.token !== completed || finishing.current === completed) return;
    finishing.current = completed;
    try {
      if (pending.deletion) {
        if (pending.deletion.base !== local.workspace) setFormError(copy.storageErrors.conflict);
        // Retain navigation requests: removing an unrelated object must not undo a previous destination.
        else if (await local.commit(pending.deletion.next)) setNotice("deleted");
      }
    } catch { setFormError(copy.invalidError); }
    finally { setPending(null); }
  }, [pending, local, copy.storageErrors.conflict, copy.invalidError]);
  useEffect(() => {
    if (!pending) return;
    // Recovery path when WebGL/dynamic scene initialization is unavailable.
    const timeout = window.setTimeout(() => finishTransition(pending.command.token), 1800);
    return () => window.clearTimeout(timeout);
  }, [pending, finishTransition]);
  return {
    local, source, setSource, catalog, editor, setEditor, deletion, setDeletion, managerOpen, setManagerOpen,
    transfer, setTransfer, transferMessage, openImport, importJson, exportJson, selectUniverse,
    floatOpen, setFloatOpen, formError, clearFormError, notice, pending, navigationRequest,
    findEntity, openCreate, openManager, createFromManager: () => openCreate(managerTarget.current), openEdit, openDelete, navigate, submit, confirmDelete, finishTransition,
    busy: Boolean(pending) || saving,
  };
}
