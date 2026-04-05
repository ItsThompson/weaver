import type { Snippet } from "@weaver/shared/types";

export interface SnippetCardProps {
  snippet: Snippet;
  onEdit: (snippet: Snippet) => void;
  onDelete: (snippet: Snippet) => void;
}

export interface SnippetFormProps {
  initial?: Snippet;
  onSave: (trigger: string, expansion: string) => void;
  onCancel: () => void;
}
