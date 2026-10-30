import { exportWorkspaceJson, TransferValidationError, workspaceLimits, type LocalWorkspace } from "../domain";

/** Check the file before allocating its contents; file names and MIME types are not trust boundaries. */
export async function readWorkspaceJsonFile(file: Pick<File, "size" | "arrayBuffer">): Promise<string> {
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > workspaceLimits.bytes) throw new TransferValidationError("size");
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > workspaceLimits.bytes) throw new TransferValidationError("size");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch { throw new TransferValidationError("syntax"); }
}

export function downloadWorkspaceJson(workspace: LocalWorkspace): void {
  const json = exportWorkspaceJson(workspace);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `hackuniverse-workspace-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  try { anchor.click(); }
  finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
