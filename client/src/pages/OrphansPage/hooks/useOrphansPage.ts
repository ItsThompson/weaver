import { useState } from "react";
import type { SelectProps } from "@cloudscape-design/components/select";
import type { OrphanGroup, SessionWithStatus } from "@weaver/shared/types";
import { assignOrphans, deleteOrphans } from "../../../utils/api";
import {
  useOrphansQuery,
  useSessionsQuery,
  revalidateOrphans,
} from "../../../hooks/queries";

export interface DeleteTarget {
  pid: number;
  eventCount: number;
}

export function useOrphansPage() {
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
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
    .map((s) => ({
      value: s.id,
      label: s.customName || `Session ${s.id.slice(0, 8)}`,
      description: `${s.cwd} · PID ${s.pid}`,
      tags: [s.status],
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
    } catch {
      // Error will surface on next revalidation
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
