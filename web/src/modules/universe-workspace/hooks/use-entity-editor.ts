"use client";

import { useState } from "react";
import { getParentKind, type EntityKind, type UniverseCatalog, type UniverseEntity } from "../../universe/domain";
import type { EntityDraft } from "../domain";
import { getEditorIssues, getEditorSteps, type EditorIssue, type EditorStep } from "../configs/editor-steps";

type Options = { entity?: UniverseEntity; catalog?: UniverseCatalog; defaultKind?: EntityKind; parentId?: string; parentSuggestions?: Partial<Record<EntityKind, string>>; onSubmit: (draft: EntityDraft) => void };

export function useEntityEditor({ entity, catalog, defaultKind = "planet", parentId, parentSuggestions, onSubmit }: Options) {
  const initialKind = entity?.kind ?? defaultKind;
  const [kind, setKind] = useState<EntityKind>(initialKind);
  const [name, setName] = useState(entity?.name ?? "");
  const [description, setDescription] = useState(entity?.description ?? "");
  const [href, setHref] = useState(entity?.kind === "planet" ? entity.reference?.href ?? "" : "");
  const [descriptionExpanded, setDescriptionExpanded] = useState(Boolean(entity?.description));
  const [websiteExpanded, setWebsiteExpanded] = useState(Boolean(entity?.kind === "planet" && entity.reference?.href));
  const [parentChoices, setParentChoices] = useState<Partial<Record<EntityKind, string>>>(() => ({ ...parentSuggestions, [initialKind]: entity?.parentId ?? parentId ?? parentSuggestions?.[initialKind] ?? "" }));
  const steps = getEditorSteps(kind, Boolean(entity));
  const [requestedStep, setStep] = useState<EditorStep>(entity ? "details" : "type");
  const step = steps.includes(requestedStep) ? requestedStep : steps[0];
  const [issue, setIssue] = useState<EditorIssue | null>(null);
  const parentKind = getParentKind(kind);
  const parents = catalog?.entities.filter((item) => item.kind === parentKind) ?? [];
  const parent = parents.some((item) => item.id === parentChoices[kind]) ? parentChoices[kind]! : "";
  const draft: EntityDraft = { kind, name, description, ...(parent ? { parentId: parent } : {}), ...(kind === "planet" ? { href: href.trim() } : {}), ...(entity ? { seed: entity.seed } : {}) };
  const index = steps.indexOf(step);
  const move = (destination: EditorStep) => {
    if (!steps.includes(destination)) return;
    // Draft navigation is unrestricted; only the final action validates fields.
    setIssue(null);
    setStep(destination);
  };
  const advance = () => {
    if (step !== "review") { move(steps[index + 1]); return; }
    const invalid = getEditorIssues(draft)[0];
    if (invalid) {
      // Mount the optional website field in the same render as its validation issue.
      if (invalid.field === "href") setWebsiteExpanded(true);
      setIssue(invalid); setStep(invalid.step); return;
    }
    onSubmit({ ...draft, name: name.trim() });
  };
  return {
    kind, name, description, href, parent, parentKind, parents, steps, step, index, issue,
    setKind: (next: EntityKind) => { if (!entity) setKind(next); setIssue(null); },
    setName: (value: string) => { setName(value); if (issue?.field === "name") setIssue(null); },
    setDescription,
    descriptionExpanded, setDescriptionExpanded,
    websiteExpanded, setWebsiteExpanded,
    setHref: (value: string) => { setHref(value); if (issue?.field === "href") setIssue(null); },
    setParent: (value: string) => setParentChoices((current) => ({ ...current, [kind]: value })),
    move, advance, back: () => { if (index > 0) move(steps[index - 1]); },
  };
}
