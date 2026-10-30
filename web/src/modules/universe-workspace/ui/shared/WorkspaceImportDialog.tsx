"use client";

import { useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, FileJson, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, useDialogReturnFocus } from "@/components/ui/dialog";
import { JsonEditor } from "@/components/ui/json-editor";
import { Select } from "@/components/ui/select";
import { StepNavigation } from "@/components/ui/step-navigation";
import { parseTransferJson, workspaceLimits, type LocalWorkspace } from "../../domain";
import { useJsonImport, workspaceCounts } from "../../hooks/use-json-import";
import type { WorkspaceCopy } from "../../messages";
import "./transfer.css";

export type WorkspaceImportDialogProps = {
  base: LocalWorkspace;
  current: LocalWorkspace;
  copy: WorkspaceCopy;
  busy: boolean;
  blocked: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onImport: (workspace: LocalWorkspace, mode: "merge" | "replace", confirmed: boolean) => Promise<boolean>;
};

function summary(template: string, workspace: LocalWorkspace) {
  const counts = workspaceCounts(workspace);
  return template.replace("{universes}", String(counts.universes)).replace("{entities}", String(counts.entities)).replace("{planets}", String(counts.planets));
}

export function WorkspaceImportDialog(props: WorkspaceImportDialogProps) {
  const { copy, busy, onOpenChange } = props;
  const focusReturn = useDialogReturnFocus();
  return <Dialog open onOpenChange={(open) => { if (!busy) onOpenChange(open); }}>
    <DialogContent {...focusReturn} className="workspace-import-dialog" closeLabel={copy.close} showCloseButton={!busy}>
      <DialogHeader><DialogTitle className="hud-title">{copy.transfer.title}</DialogTitle><DialogDescription>{copy.transfer.description}</DialogDescription></DialogHeader>
      <WorkspaceImportForm {...props} />
    </DialogContent>
  </Dialog>;
}

function WorkspaceImportForm(props: WorkspaceImportDialogProps) {
  const { base, copy, busy, blocked, error, onOpenChange, onImport } = props;
  const form = useJsonImport(props);
  const [pasting, setPasting] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [inlineEditing, setInlineEditing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const id = useId();
  const text = copy.transfer;
  const disabled = busy || blocked;
  const previous = form.stage === "review" ? "mode" : "source";
  return <div className="workspace-transfer">
    <StepNavigation label={text.navigation} current={form.stage} disabled={busy || inlineEditing} onStepChange={form.setStage} steps={Object.entries(text.steps).map(([key, label]) => ({ id: key, label }))} />
    {form.stale && <p role="alert" className="workspace-editor-error">{text.conflictHint}</p>}
    {form.stage === "source" ? <div className="workspace-transfer-source">
      <input ref={fileInput} id={`${id}-file`} type="file" aria-label={text.fileLabel} hidden accept=".json,application/json" disabled={disabled || form.reading} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void form.loadFile(file); }} />
      {!pasting ? <>
        <Button type="button" variant="outline" className="workspace-transfer-file" disabled={disabled || form.reading} onClick={() => fileInput.current?.click()}><FileJson aria-hidden="true" />{form.reading ? text.editorLoading : text.chooseFile}</Button>
        <p className="workspace-editor-hint">{text.sourceShortHint}</p>
        <Button type="button" variant="ghost" disabled={disabled || form.reading} onClick={() => setPasting(true)}>{text.pasteToggle}</Button>
      </> : <>
        <div className="workspace-editor-field"><label htmlFor={`${id}-paste`}>{text.pasteLabel}</label><textarea id={`${id}-paste`} rows={6} maxLength={workspaceLimits.bytes} spellCheck={false} disabled={disabled || form.reading} value={form.text} onChange={(event) => form.setText(event.target.value)} onPaste={(event) => { const paste = event.clipboardData.getData("text"); if (new TextEncoder().encode(paste).length > workspaceLimits.bytes) { event.preventDefault(); form.setText(paste); } }} placeholder={text.formatHint} /></div>
        <Button type="button" variant="ghost" disabled={disabled || form.reading} onClick={() => setPasting(false)}>{text.fileToggle}</Button>
      </>}
    </div> : !form.draft ? <p className="workspace-editor-hint">{text.reviewEmpty}</p> : form.stage === "mode" ? <div className="workspace-transfer-options">
      <h3>{text.modeTitle}</h3>
      {form.preview?.incoming && <p className="workspace-editor-hint">{summary(text.summary, form.preview.incoming)}</p>}
      <div className="workspace-editor-field"><label className="sr-only" htmlFor={`${id}-mode`}>{text.modeLabel}</label><Select id={`${id}-mode`} value={form.mode} disabled={disabled || form.stale} onValueChange={(mode) => form.setMode(mode === "replace" ? "replace" : "merge")} options={[{ value: "merge", label: text.modeMerge }, { value: "replace", label: text.modeReplace }]} /></div>
      <p className="workspace-editor-hint">{form.mode === "merge" ? text.mergeHint : text.replaceHint}</p>
      <Button type="button" variant="ghost" disabled={disabled || inlineEditing} aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>{advanced ? text.advancedHide : text.advancedToggle}</Button>
      {advanced && <JsonEditor value={form.draft} onChange={form.changeDraft} validate={form.validate} parse={parseTransferJson} label={text.editorLabel} loadingLabel={text.editorLoading} loadErrorLabel={text.editorLoadError} retryLabel={text.retry} invalidValueLabel={text.editorInvalid} translations={text.editorText} rootName="workspace" disabled={disabled || form.stale} onError={form.editorError} onEditingChange={setInlineEditing} />}
      {inlineEditing && <p className="workspace-editor-hint" role="status">{text.editingHint}</p>}
    </div> : <div className="workspace-transfer-review">
      <h3>{text.reviewTitle}</h3><p className="workspace-editor-hint">{text.reviewHint}</p>
      <div className="workspace-transfer-summary"><p>{summary(text.currentSummary, base)}</p>{form.preview?.result && <p>{summary(text.resultSummary, form.preview.result)}</p>}</div>
      {form.needsAcknowledgement && <label className="workspace-transfer-confirm"><input type="checkbox" checked={form.acknowledged} disabled={disabled || form.stale} onChange={(event) => form.setAcknowledged(event.target.checked)} /><span>{text.replaceAcknowledge.replace("{entities}", String(form.counts.entities))}</span></label>}
    </div>}
    {(error || form.errorMessage || form.preview?.error) && <p className="workspace-editor-error" role="alert">{error ?? form.errorMessage ?? (form.preview?.error ? text.errors[form.preview.error] : null)}</p>}
    <details className="workspace-transfer-limits"><summary>{text.limitsToggle}</summary><p>{text.limits}</p><p>{text.formatHint}</p></details>
    <DialogFooter className="workspace-transfer-footer">
      <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>{copy.cancel}</Button>
      {form.stage !== "source" && <Button type="button" variant="outline" disabled={busy || inlineEditing} onClick={() => form.setStage(previous)}><ArrowLeft aria-hidden="true" />{copy.wizard.back}</Button>}
      {form.stage === "source" ? pasting || form.draft ? <Button type="button" disabled={disabled || form.reading || !form.text} onClick={() => { if (form.draft) form.setStage("mode"); else form.loadText(); }}>{copy.wizard.next}<ArrowRight aria-hidden="true" /></Button> : null : form.stage === "mode" ? <Button type="button" disabled={disabled || inlineEditing || !form.draft} onClick={() => form.setStage("review")}>{copy.wizard.next}<ArrowRight aria-hidden="true" /></Button> : <Button type="button" variant={form.mode === "replace" ? "destructive" : "default"} disabled={disabled || inlineEditing || !form.canImport} onClick={() => { if (form.preview?.incoming && form.canImport && !inlineEditing) void onImport(form.preview.incoming, form.mode, form.acknowledged); }}><Upload aria-hidden="true" />{busy ? text.importing : form.mode === "replace" ? text.replaceConfirm : text.importConfirm}</Button>}
    </DialogFooter>
  </div>;
}
