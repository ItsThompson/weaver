import { useState } from "react";
import type { Snippet } from "@weaver/shared/types";
import { useSnippetsQuery, revalidateSnippets } from "../../../hooks/queries";
import {
  createSnippet,
  updateSnippet,
  deleteSnippetApi,
} from "../../../utils/api";

export type FormMode =
  | { type: "closed" }
  | { type: "add" }
  | { type: "edit"; snippet: Snippet };

export function useSnippetsPage() {
  const { data, isLoading, error } = useSnippetsQuery();
  const snippets = data?.snippets ?? [];
  const [formMode, setFormMode] = useState<FormMode>({ type: "closed" });
  const [saving, setSaving] = useState(false);

  const openAdd = () => setFormMode({ type: "add" });
  const openEdit = (snippet: Snippet) => setFormMode({ type: "edit", snippet });
  const closeForm = () => setFormMode({ type: "closed" });

  const handleSave = async (trigger: string, expansion: string) => {
    setSaving(true);
    try {
      if (formMode.type === "edit") {
        await updateSnippet(formMode.snippet.id, trigger, expansion);
      } else {
        await createSnippet(trigger, expansion);
      }
      await revalidateSnippets();
      closeForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (snippet: Snippet) => {
    await deleteSnippetApi(snippet.id);
    await revalidateSnippets();
  };

  return {
    snippets,
    isLoading,
    error,
    formMode,
    saving,
    openAdd,
    openEdit,
    closeForm,
    handleSave,
    handleDelete,
  };
}
