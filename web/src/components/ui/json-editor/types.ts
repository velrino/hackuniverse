import type { LocalisedStrings } from "json-edit-react";

export type JsonEditorTranslations = Partial<LocalisedStrings>;

export type JsonEditorProps = Readonly<{
  value: object;
  onChange: (value: object) => void;
  /** A synchronous structural gate. Return an error string or false to reject. */
  validate: (value: unknown) => string | false | void;
  /** Parse and bound arbitrary JSON nodes before the editor traverses them. */
  parse: (text: string) => unknown;
  label: string;
  loadingLabel: string;
  loadErrorLabel: string;
  retryLabel: string;
  invalidValueLabel: string;
  translations: JsonEditorTranslations;
  rootName?: string;
  disabled?: boolean;
  className?: string;
  /** Reports inline edit sessions, including drafts that have not been committed yet. */
  onEditingChange?: (editing: boolean) => void;
  /** A data-free notification; the host owns user-facing error handling. */
  onError?: () => void;
}>;
