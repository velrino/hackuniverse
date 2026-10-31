"use client";

import { createContext, useContext, useId, useMemo, type ComponentProps } from "react";
import { Database, Globe2, Pencil, Plus, Share2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FloatButtonGroup } from "@/components/ui/float-button-group";
import { useI18n } from "@/i18n";
import { useIdentityDialog } from "@/modules/identity";
import { UniverseHost } from "@/modules/universe/host/UniverseHost";
import { getChildKind, parseUniverseCatalog, type UniverseCatalog } from "@/modules/universe/domain";
import type { UniverseActionContext, UniverseManagement, UniverseTourDefinition } from "@/modules/universe";
import { getWorkspaceCopy, type WorkspaceCopy } from "../messages";
import { useWorkspaceSession } from "../hooks/use-workspace-session";
import { EntityEditorDialog } from "../ui/shared/EntityEditorDialog";
import { DeleteEntityDialog } from "../ui/shared/DeleteEntityDialog";
import { WorkspaceManager } from "../ui/shared/WorkspaceManager";
import { WorkspaceImportDialog } from "../ui/shared/WorkspaceImportDialog";
import "../ui/layout/workspace.css";

type WorkspaceContextValue = { session: ReturnType<typeof useWorkspaceSession>; copy: WorkspaceCopy; openLogin: () => void };
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
function useWorkspaceTools() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspace tools require a workspace host.");
  return context;
}

function SourceControls({ target, onRequestClose }: ComponentProps<UniverseManagement["Controls"]>) {
  const { session, copy, openLogin } = useWorkspaceTools();
  const id = useId();
  return <div className="workspace-source-controls">
    <label htmlFor={`${id}-source`}>{copy.sourceLabel}</label>
    <Select id={`${id}-source`} value={session.source} disabled={session.busy || !session.local.ready} onValueChange={(value) => {
      onRequestClose();
      session.setFloatOpen(false);
      if (value === "account") { openLogin(); return; }
      session.setSource(value === "local" ? "local" : "demo");
    }} options={[
      { value: "demo", label: copy.sources.demo },
      { value: "local", label: copy.sources.local },
      { value: "account", label: copy.sources.account },
    ]} />
    <p>{session.source === "local" ? copy.localOnly : copy.sourceHint}</p>
    {session.source === "local" && <>
      <label htmlFor={`${id}-universe`}>{copy.universeLabel}</label>
      <Select id={`${id}-universe`} value={session.local.workspace.activeUniverseId ?? ""} disabled={!session.catalog || session.busy} onValueChange={async (value) => {
        if (await session.selectUniverse(value)) onRequestClose();
      }} options={[
        ...(!session.catalog ? [{ value: "", label: copy.emptyTitle }] : []),
        ...session.local.workspace.universes.map((universe) => ({ value: universe.rootId, label: universe.entities.find((item) => item.id === universe.rootId)?.name ?? universe.rootId })),
      ]} />
      <Button type="button" variant="outline" onClick={() => { onRequestClose(); session.openManager(target); }}><Database aria-hidden="true" />{copy.manage}</Button>
      {session.formError && <p role="alert">{session.formError}</p>}
    </>}
  </div>;
}

function SelectionActions({ target, onInteraction, disabled }: UniverseActionContext) {
  const { session, copy } = useWorkspaceTools();
  const entity = session.findEntity(target);
  if (!entity) return null;
  return <div className="workspace-selection-actions">
    <Button type="button" variant="outline" disabled={disabled || session.busy} onClick={() => { onInteraction(); session.openEdit(entity); }}><Pencil aria-hidden="true" />{copy.edit}</Button>
    <Button type="button" variant="outline" disabled={disabled || session.busy} onClick={() => { onInteraction(); session.openDelete(entity); }}><Trash2 aria-hidden="true" />{copy.remove}</Button>
  </div>;
}

function FloatingActions({ target, onInteraction, disabled, share }: ComponentProps<UniverseManagement["Actions"]>) {
  const { session, copy } = useWorkspaceTools();
  const entity = session.findEntity(target);
  const action = (run: () => void) => () => { onInteraction(); run(); };
  return <div className="workspace-float">
    <FloatButtonGroup label={copy.actions} open={session.floatOpen} onOpenChange={(open) => { if (open) onInteraction(); session.setFloatOpen(open); }} disabled={disabled || session.busy || !session.local.ready} actions={[
      { id: "create", label: copy.create, icon: <Plus aria-hidden="true" />, onSelect: action(() => session.openCreate(target)) },
      ...(share ? [{ id: "share", label: share.label, icon: <Share2 aria-hidden="true" />, onSelect: share.onSelect }] : []),
      { id: "manage", label: copy.manage, icon: <Database aria-hidden="true" />, onSelect: action(() => session.openManager(target)) },
      ...(entity ? [
        { id: "edit", label: copy.edit, icon: <Pencil aria-hidden="true" />, onSelect: action(() => session.openEdit(entity)) },
        { id: "delete", label: copy.remove, icon: <Trash2 aria-hidden="true" />, onSelect: action(() => session.openDelete(entity)) },
      ] : []),
    ]} />
  </div>;
}

function EmptyState({ target, onInteraction }: UniverseActionContext) {
  const { session, copy } = useWorkspaceTools();
  if (session.source !== "local" || !session.local.ready) return null;
  return <section className="workspace-empty" aria-label={copy.emptyTitle}>
    <Globe2 aria-hidden="true" size={38} />
    <h2>{copy.emptyTitle}</h2><p>{copy.emptyDescription}</p>
    <Button type="button" disabled={Boolean(session.local.error)} onClick={() => { onInteraction(); session.openCreate(target, session.catalog ? getChildKind(target.kind) ?? "planet" : "universe"); }}><Sparkles aria-hidden="true" />{copy.create}</Button>
  </section>;
}

/** Application composition: local/demo selection stays outside the reusable universe renderer. */
export function UniverseWorkspaceHost({ demoCatalog, demoTour }: { demoCatalog: UniverseCatalog; demoTour?: UniverseTourDefinition }) {
  const { locale } = useI18n();
  const copy = getWorkspaceCopy(locale);
  const identity = useIdentityDialog();
  const session = useWorkspaceSession(copy);
  const placeholder = useMemo(() => parseUniverseCatalog({ schemaVersion: 1, mode: "live", rootId: "local-empty-preview", entities: [{ id: "local-empty-preview", kind: "universe", parentId: null, name: copy.emptyTitle, description: "", seed: 0 }] }), [copy.emptyTitle]);
  const catalog = session.source === "demo" ? demoCatalog : session.catalog ?? placeholder;
  const management: UniverseManagement = {
    blocked: Boolean(session.editor || session.deletion || session.transfer || session.managerOpen || session.floatOpen || session.busy || identity.isOpen),
    navigationRequest: session.source === "local" ? session.navigationRequest : undefined,
    entityTransition: session.pending?.command,
    onEntityTransitionEnd: session.finishTransition,
    Actions: FloatingActions,
    SelectionActions,
    EmptyState,
    Controls: SourceControls,
  };
  const error = session.local.error ? copy.storageErrors[session.local.error] : session.formError;
  return <WorkspaceContext value={{ session, copy, openLogin: identity.openLogin }}>
    <div className="workspace-host" data-source={session.source} data-transition={session.pending?.command.action ?? "idle"}>
      <UniverseHost key={`${session.source}:${catalog.rootId}`} catalog={catalog} source={session.source} tour={session.source === "demo" ? demoTour : undefined} management={management} />
      {error && !session.editor && !session.deletion && !session.transfer && <div className="workspace-warning" role="alert"><p>{error}</p><Button type="button" variant="outline" onClick={() => { session.clearFormError(); session.local.retry(); }}>{copy.retry}</Button></div>}
      <div className="workspace-status" role="status" aria-live="polite">
        {session.busy ? <><Sparkles aria-hidden="true" size={14} />{session.transfer ? copy.transfer.importing : session.pending?.command.action === "delete" ? copy.destroying : copy.creating}</> : session.notice ? copy[session.notice] : session.source === "local" ? copy.sources.local : null}
      </div>
      <EntityEditorDialog open={Boolean(session.editor)} onOpenChange={(open) => { if (!open) session.setEditor(null); }} entity={session.editor?.entity} defaultKind={session.editor?.kind} parentSuggestions={session.editor?.parentSuggestions} catalog={session.catalog} copy={copy} busy={session.busy} storageBlocked={!session.local.ready || Boolean(session.local.error && session.local.error !== "conflict")} error={error} onSubmit={session.submit} />
      {session.deletion && <DeleteEntityDialog open onOpenChange={(open) => { if (!open) session.setDeletion(null); }} entity={session.deletion.entity} count={session.deletion.count} copy={copy} busy={session.busy} storageBlocked={Boolean(session.local.error && session.local.error !== "conflict")} error={error} onConfirm={session.confirmDelete} />}
      <WorkspaceManager open={session.managerOpen} onOpenChange={session.setManagerOpen} catalog={session.catalog} copy={copy} onNavigate={session.navigate} onEdit={session.openEdit} onDelete={session.openDelete} onCreate={session.createFromManager} onImport={session.openImport} onExport={session.exportJson} disabled={session.busy || !session.local.ready || Boolean(session.local.error && session.local.error !== "conflict")} transferStatus={session.transferMessage ? copy.transfer[session.transferMessage] : undefined} />
      {session.transfer && <WorkspaceImportDialog base={session.transfer} current={session.local.workspace} copy={copy} busy={session.busy} blocked={!session.local.ready || Boolean(session.local.error && session.local.error !== "conflict")} error={error} onOpenChange={(open) => { if (!open) session.setTransfer(null); }} onImport={session.importJson} />}
    </div>
  </WorkspaceContext>;
}
