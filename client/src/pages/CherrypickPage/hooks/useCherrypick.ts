import { useState, useCallback } from "react";
import type {
  SavedConversation,
  ConversationExchange,
} from "../../../types/conversation";
import { parseConversation } from "../../../utils/group-exchanges";
import { pruneConversation } from "../../../utils/prune-conversation";
import type { PageState, CherrypickState, CherrypickActions } from "../types";

function toggleId(
  set: Set<number>,
  setFn: (s: Set<number>) => void,
  id: number,
) {
  const next = new Set(set);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  setFn(next);
}

function toggleAll(
  exchanges: ConversationExchange[],
  selected: Set<number>,
  setFn: (s: Set<number>) => void,
) {
  const allSelected = exchanges.every((ex) => selected.has(ex.id));
  setFn(allSelected ? new Set() : new Set(exchanges.map((ex) => ex.id)));
}

export function useCherrypick(): {
  state: CherrypickState;
  actions: CherrypickActions;
} {
  const [pageState, setPageState] = useState<PageState>({ phase: "upload" });
  const [error, setError] = useState<string | null>(null);
  const [deleteMainIds, setDeleteMainIds] = useState<Set<number>>(new Set());
  const [deleteTangentIds, setDeleteTangentIds] = useState<Set<number>>(
    new Set(),
  );

  const handleFile = useCallback((file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string) as SavedConversation;
        if (!json.history || !json.conversation_id) {
          setError("Invalid file: missing history or conversation_id");
          return;
        }
        const parsed = parseConversation(json);
        setDeleteMainIds(new Set());
        setDeleteTangentIds(new Set());
        setPageState({ phase: "edit", parsed, fileName: file.name });
      } catch {
        setError("Failed to parse JSON file");
      }
    };
    reader.readAsText(file);
  }, []);

  const handlePreview = useCallback(() => {
    if (pageState.phase !== "edit") {
      return;
    }
    const pruned = pruneConversation(
      pageState.parsed.raw,
      deleteMainIds,
      deleteTangentIds,
    );
    setPageState({ ...pageState, phase: "preview", pruned });
  }, [pageState, deleteMainIds, deleteTangentIds]);

  const handleDownload = useCallback(() => {
    if (pageState.phase !== "preview") {
      return;
    }
    const blob = new Blob([JSON.stringify(pageState.pruned, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = pageState.fileName.replace(/\.json$/, "-pruned.json");
    a.click();
    URL.revokeObjectURL(url);
  }, [pageState]);

  const handleReset = useCallback(() => {
    setDeleteMainIds(new Set());
    setDeleteTangentIds(new Set());
    setPageState({ phase: "upload" });
    setError(null);
  }, []);

  const goBackToEdit = useCallback(() => {
    if (pageState.phase !== "preview") {
      return;
    }
    setPageState({
      phase: "edit",
      parsed: pageState.parsed,
      fileName: pageState.fileName,
    });
  }, [pageState]);

  return {
    state: {
      pageState,
      error,
      deleteMainIds,
      deleteTangentIds,
      totalSelected: deleteMainIds.size + deleteTangentIds.size,
    },
    actions: {
      handleFile,
      handlePreview,
      handleDownload,
      handleReset,
      toggleMainId: (id) => toggleId(deleteMainIds, setDeleteMainIds, id),
      toggleTangentId: (id) =>
        toggleId(deleteTangentIds, setDeleteTangentIds, id),
      toggleAllMain: (exchanges) =>
        toggleAll(exchanges, deleteMainIds, setDeleteMainIds),
      toggleAllTangent: (exchanges) =>
        toggleAll(exchanges, deleteTangentIds, setDeleteTangentIds),
      goBackToEdit,
    },
  };
}
