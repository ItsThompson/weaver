import { useState } from "react";
import type { SelectProps } from "@cloudscape-design/components/select";
import type { OrphanGroup } from "@weaver/shared/types";
import { assignOrphans, deleteOrphans } from "../../../utils/api";
import {
  useOrphansQuery,
  useSessionsQuery,
  revalidateOrphans,
} from "../../../hooks/queries";
import type { DeleteTarget } from "../types";

export type { DeleteTarget };

export interface OrphansPageState {
  groups: OrphanGroup[];
  loading: boolean;
  error: Error | undefined;
  sessionOptions: SelectProps.Options;
  selectedSessions: Record<number, SelectProps.Option | null>;
  assigning: number | null;
  deleteTarget: DeleteTarget | null;
  deleting: boolean;
  handleAssign: (pid: number) => Promise<void>;
  handleDelete: () => Promise<void>;
  selectSession: (pid: number, option: SelectProps.Option) => void;
  setDeleteTarget: (target: DeleteTarget | null) => void;
}

export function useOrphansPage(): OrphansPageState {
  const {
    data: orphanData,
    error: orphanError,
    isLoading: orphansLoading,
  } = useOrphansQuery();
  const { data: sessions = [] } = useSessionsQuery();
  const [selectedSessions, setSelectedSessions] = useState<
    Record<number, SelectProps.Option | null>
  >({});
  const [assigning, setAssigning] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const groups = orphanData?.groups ?? [];

  const sessionOptions: SelectProps.Options = sessions
    .toSorted((a, b) => b.startTime.localeCompare(a.startTime))
    .map((session) => ({
      value: session.id,
      label: session.customName || `Session ${session.id.slice(0, 8)}`,
      description: `${session.cwd} · PID ${session.pid}`,
      tags: [session.status],
    }));

  const handleAssign = async (pid: number) => {
    const selected = selectedSessions[pid];
    if (!selected?.value) {
      return;
    }
    setAssigning(pid);
    try {
      await assignOrphans(selected.value, pid);
      revalidateOrphans();
      setSelectedSessions((prev) => {
        const next = { ...prev };
        delete next[pid];
        return next;
      });
    } catch (error) {
      console.error("Failed to assign orphans:", error);
    } finally {
      setAssigning(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleting(true);
    try {
      await deleteOrphans(deleteTarget.pid);
      revalidateOrphans();
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const selectSession = (pid: number, option: SelectProps.Option) => {
    setSelectedSessions((prev) => ({ ...prev, [pid]: option }));
  };

  return {
    groups,
    loading: orphansLoading,
    error: orphanError,
    sessionOptions,
    selectedSessions,
    assigning,
    deleteTarget,
    deleting,
    handleAssign,
    handleDelete,
    selectSession,
    setDeleteTarget,
  };
}
