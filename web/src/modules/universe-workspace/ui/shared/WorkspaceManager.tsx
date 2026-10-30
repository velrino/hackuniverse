"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDialogReturnFocus, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { UniverseCatalog, UniverseEntity } from "../../../universe/domain";
import type { WorkspaceCopy } from "../../messages";
import "./editor.css";
import "./transfer.css";

export type WorkspaceManagerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog?: UniverseCatalog;
  copy: WorkspaceCopy;
  onNavigate: (id: string) => void;
  onEdit: (entity: UniverseEntity) => void;
  onDelete: (entity: UniverseEntity) => void;
  onCreate: () => void;
  onImport: () => void;
  onExport: () => void;
  disabled?: boolean;
  transferStatus?: string;
};

const pageSize = 24;

export function WorkspaceManager(props: WorkspaceManagerProps) {
  const { open, onOpenChange, copy, catalog } = props;
  const focusReturn = useDialogReturnFocus();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent {...focusReturn} className="workspace-manager-dialog" closeLabel={copy.close}>
        <DialogHeader>
          <DialogTitle className="hud-title">{copy.manage}</DialogTitle>
          <DialogDescription>{copy.localOnly}</DialogDescription>
        </DialogHeader>
        {open && <>
          <div className="workspace-manager-actions">
            <Button type="button" variant="outline" disabled={props.disabled} onClick={props.onCreate}><Plus aria-hidden="true" />{copy.create}</Button>
            <Button type="button" variant="outline" disabled={props.disabled} onClick={props.onImport}><Upload aria-hidden="true" />{copy.transfer.importAction}</Button>
            <Button type="button" variant="outline" disabled={props.disabled} onClick={props.onExport}><Download aria-hidden="true" />{copy.transfer.exportAction}</Button>
          </div>
          {props.transferStatus && <p className="workspace-editor-hint" role="status">{props.transferStatus}</p>}
          <WorkspaceManagerList key={catalog?.rootId ?? "empty"} {...props} />
        </>}
      </DialogContent>
    </Dialog>
  );
}

function WorkspaceManagerList({ catalog, copy, onNavigate, onEdit, onDelete }: WorkspaceManagerProps) {
  const id = useId();
  const resultsList = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (catalog?.entities ?? []).filter((entity) => !term || entity.name.toLowerCase().includes(term) || copy.kinds[entity.kind].toLowerCase().includes(term));
  }, [catalog, copy.kinds, query]);
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = results.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  useEffect(() => { if (resultsList.current) resultsList.current.scrollTop = 0; }, [currentPage, query]);

  if (!catalog?.entities.length) return <div className="workspace-manager-empty"><h3>{copy.emptyTitle}</h3><p>{copy.emptyDescription}</p></div>;

  return (
    <div className="workspace-manager-body">
      <div className="workspace-editor-field">
        <label htmlFor={`${id}-search`}>{copy.searchLabel}</label>
        <Input id={`${id}-search`} type="search" autoComplete="off" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder={copy.searchPlaceholder} />
      </div>
      <p className="workspace-editor-hint" role="status">{copy.resultCount.replace("{count}", String(results.length))}</p>
      {results.length === 0 ? <div className="workspace-manager-empty"><p>{copy.noResults}</p><Button type="button" variant="outline" onClick={() => setQuery("")}>{copy.clearSearch}</Button></div> : <ul ref={resultsList} id={`${id}-results`} className="workspace-manager-list" aria-label={copy.results}>
        {visible.map((entity) => <li key={entity.id}>
          <button type="button" className="workspace-manager-object" aria-label={`${copy.open}: ${entity.name}`} onClick={() => onNavigate(entity.id)}><strong>{entity.name}</strong><span>{copy.kinds[entity.kind]}</span></button>
          <div className="workspace-manager-actions">
            <Button type="button" variant="ghost" size="icon" aria-label={`${copy.edit}: ${entity.name}`} title={`${copy.edit}: ${entity.name}`} onClick={() => onEdit(entity)}><Pencil aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" size="icon" className="workspace-action-danger" aria-label={`${copy.remove}: ${entity.name}`} title={`${copy.remove}: ${entity.name}`} onClick={() => onDelete(entity)}><Trash2 aria-hidden="true" /></Button>
          </div>
        </li>)}
      </ul>}
      {pageCount > 1 && <nav className="workspace-manager-pagination" aria-label={copy.pages}>
        <Button type="button" variant="outline" aria-controls={`${id}-results`} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft aria-hidden="true" /><span>{copy.previousPage}</span></Button>
        <p>{copy.pageCount.replace("{page}", String(currentPage + 1)).replace("{count}", String(pageCount))}</p>
        <Button type="button" variant="outline" aria-controls={`${id}-results`} disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}><span>{copy.nextPage}</span><ChevronRight aria-hidden="true" /></Button>
      </nav>}
    </div>
  );
}
