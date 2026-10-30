"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDialogReturnFocus, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StepNavigation } from "@/components/ui/step-navigation";
import { entityHierarchy as kinds, type EntityKind, type UniverseCatalog, type UniverseEntity } from "../../../universe/domain";
import type { EntityDraft } from "../../domain";
import type { WorkspaceCopy } from "../../messages";
import { useEntityEditor } from "../../hooks/use-entity-editor";
import "./editor.css";

export type EntityEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity?: UniverseEntity;
  catalog?: UniverseCatalog;
  defaultKind?: EntityKind;
  parentId?: string;
  parentSuggestions?: Partial<Record<EntityKind, string>>;
  copy: WorkspaceCopy;
  error?: string;
  busy: boolean;
  storageBlocked?: boolean;
  onSubmit: (draft: EntityDraft) => void;
};

export function EntityEditorDialog(props: EntityEditorDialogProps) {
  const { open, onOpenChange, entity, copy, busy } = props;
  const focusReturn = useDialogReturnFocus();
  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
    <DialogContent {...focusReturn} className="workspace-editor-dialog workspace-editor-dialog--wizard" closeLabel={copy.close} showCloseButton={!busy}>
      <DialogHeader>
        <DialogTitle className="hud-title">{entity ? copy.editTitle : copy.createTitle}</DialogTitle>
        <DialogDescription className="sr-only">{copy.editorDescription}</DialogDescription>
      </DialogHeader>
      {open && <EntityEditorForm key={entity?.id ?? "new"} {...props} />}
    </DialogContent>
  </Dialog>;
}

function EntityEditorForm(props: EntityEditorDialogProps) {
  const { entity, copy, error, busy, storageBlocked, onOpenChange } = props;
  const wizard = useEntityEditor(props);
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const websiteInput = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const [changeParent, setChangeParent] = useState(false);
  const issue = wizard.issue;
  const errorId = id + "-error";
  const titleId = id + "-title";
  const finalStep = wizard.step === "review";
  const stepTitle = copy.wizard.questions[wizard.step];
  const parentName = wizard.parents.find((parent) => parent.id === wizard.parent)?.name;
  const fieldsBlocked = busy || storageBlocked;
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [wizard.step]);
  useEffect(() => {
    if (issue?.field === "name") nameInput.current?.focus();
    else if (issue?.field === "href") websiteInput.current?.focus();
  }, [issue, wizard.websiteExpanded, wizard.step]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || composing.current || finalStep && storageBlocked) return;
    wizard.advance();
  };
  const edit = (step: "type" | "details" | "location") => <Button type="button" size="sm" variant="ghost" disabled={busy} aria-label={copy.wizard.editStep.replace("{step}", copy.wizard.steps[step])} onClick={() => wizard.move(step)}><Pencil size={14} aria-hidden="true" />{copy.edit}</Button>;

  return <form className="workspace-editor-form editor-wizard" noValidate onSubmit={submit} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} aria-describedby={error || issue ? errorId : undefined}>
    <StepNavigation label={copy.wizard.navigation} current={wizard.step} disabled={busy} onStepChange={(step) => wizard.move(step as typeof wizard.step)} steps={wizard.steps.map((step) => ({ id: step, label: copy.wizard.steps[step], shortLabel: step === "location" ? copy.wizard.locationShort : undefined }))} />
    <div className="editor-wizard__content">
      <h3 id={titleId} ref={heading} tabIndex={-1} className="editor-wizard__title">{stepTitle}</h3>
      <fieldset disabled={fieldsBlocked} aria-labelledby={titleId} className="editor-wizard__fields">
        {wizard.step === "type" && <div className="workspace-editor-field">
          <label className="sr-only" htmlFor={id + "-kind"}>{copy.kindLabel}</label>
          <Select id={id + "-kind"} value={wizard.kind} disabled={fieldsBlocked} onValueChange={(value) => wizard.setKind(value as EntityKind)} options={kinds.map((kind) => ({ value: kind, label: copy.kinds[kind] }))} />
        </div>}
        {wizard.step === "details" && <>
          <div className="workspace-editor-field">
            <label htmlFor={id + "-name"}>{copy.nameLabel}</label>
            <Input ref={nameInput} id={id + "-name"} autoComplete="off" maxLength={160} required value={wizard.name} aria-invalid={issue?.field === "name" || undefined} aria-describedby={issue?.field === "name" ? errorId : undefined} onChange={(event) => wizard.setName(event.target.value)} placeholder={copy.namePlaceholder} />
          </div>
          <div className="workspace-editor-field">
            <Button type="button" variant="ghost" className="editor-wizard__disclosure" aria-expanded={wizard.descriptionExpanded} aria-controls={wizard.descriptionExpanded ? id + "-description" : undefined} onClick={() => wizard.setDescriptionExpanded(!wizard.descriptionExpanded)}>
              {wizard.descriptionExpanded ? <ChevronUp size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}{wizard.descriptionExpanded ? copy.descriptionLabel : copy.wizard.addDescription}
            </Button>
            {wizard.descriptionExpanded && <>
              <label className="sr-only" htmlFor={id + "-description"}>{copy.descriptionLabel}</label>
              <textarea id={id + "-description"} maxLength={4000} rows={3} value={wizard.description} onChange={(event) => wizard.setDescription(event.target.value)} placeholder={copy.descriptionPlaceholder} />
            </>}
          </div>
        </>}
        {wizard.step === "location" && <>
          <div className="workspace-editor-field editor-wizard__location">
            <div className="editor-wizard__suggestion">
              <p id={id + "-parent-hint"}>{parentName ? copy.wizard.suggestedParent.replace("{parent}", parentName) : copy.wizard.automaticLocation}</p>
              {wizard.parents.length > 0 && <Button type="button" variant="ghost" size="sm" aria-expanded={changeParent} aria-controls={changeParent ? id + "-parent" : undefined} onClick={() => setChangeParent(!changeParent)}>{changeParent ? copy.wizard.done : copy.wizard.change}{changeParent ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}</Button>}
            </div>
            {changeParent && <>
              <label htmlFor={id + "-parent"}>{copy.parentLabel} · {copy.kinds[wizard.parentKind!]}</label>
              <Select id={id + "-parent"} value={wizard.parent} disabled={fieldsBlocked} aria-describedby={id + "-parent-hint"} onValueChange={wizard.setParent} options={[
                ...(!entity ? [{ value: "", label: copy.automaticParent }] : !wizard.parent ? [{ value: "", label: copy.kinds[wizard.parentKind!] }] : []),
                ...wizard.parents.map((parent) => ({ value: parent.id, label: parent.name })),
              ]} />
            </>}
          </div>
          {wizard.kind === "planet" && <div className="workspace-editor-field">
            <Button type="button" variant="ghost" className="editor-wizard__disclosure" aria-expanded={wizard.websiteExpanded} aria-controls={wizard.websiteExpanded ? id + "-url" : undefined} onClick={() => wizard.setWebsiteExpanded(!wizard.websiteExpanded)}>
              {wizard.websiteExpanded ? <ChevronUp size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}{wizard.websiteExpanded ? copy.urlLabel : copy.wizard.addWebsite}
            </Button>
            {wizard.websiteExpanded && <>
              <label className="sr-only" htmlFor={id + "-url"}>{copy.urlLabel}</label>
              <Input ref={websiteInput} id={id + "-url"} type="url" inputMode="url" autoComplete="off" maxLength={4096} title={copy.urlHint} value={wizard.href} aria-invalid={issue?.field === "href" || undefined} onChange={(event) => wizard.setHref(event.target.value)} placeholder={copy.urlPlaceholder} aria-describedby={issue?.field === "href" ? errorId : id + "-url-hint"} />
              <p id={id + "-url-hint"} className="workspace-editor-hint">{copy.wizard.websiteHint}</p>
            </>}
          </div>}
        </>}
      </fieldset>
      {finalStep && <div className="editor-wizard__review">
          <dl className="editor-wizard__summary">
            <div><dt>{copy.nameLabel}</dt><dd><span className="editor-wizard__review-name">{wizard.name}</span>{edit("details")}</dd></div>
            <div><dt>{copy.kindLabel}</dt><dd><span>{copy.kinds[wizard.kind]}</span>{!entity && edit("type")}</dd></div>
            {wizard.kind !== "universe" && <div><dt>{copy.wizard.placeLabel}</dt><dd><span>{parentName ?? copy.wizard.automaticReview}</span>{edit("location")}</dd></div>}
          </dl>
          {wizard.description.trim() && <p className="editor-wizard__review-description">{wizard.description}</p>}
          {wizard.kind === "planet" && wizard.href.trim() && <p className="editor-wizard__review-url">{wizard.href}</p>}
          <p className="workspace-editor-hint">{copy.wizard.saveHint}</p>
      </div>}
      {(error || issue) && <p id={errorId} className="workspace-editor-error" role="alert">{issue ? copy.wizard.errors[issue.message] : error}</p>}
    </div>
    <DialogFooter className="editor-wizard__footer">
      <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>{copy.cancel}</Button>
      <div className="editor-wizard__navigation">
        <Button type="button" variant="outline" disabled={busy || wizard.index === 0} onClick={wizard.back}><ArrowLeft size={16} aria-hidden="true" />{copy.wizard.back}</Button>
        <Button type="submit" disabled={busy || finalStep && storageBlocked}>{busy ? copy.creating : finalStep ? entity ? copy.save : copy.create : copy.wizard.next}{finalStep ? <Check size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}</Button>
      </div>
    </DialogFooter>
  </form>;
}
