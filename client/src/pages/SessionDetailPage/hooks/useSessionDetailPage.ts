import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { SessionWithStatus, TurnGroup } from "@weaver/shared/types";
import { updateSessionName, toggleSessionWebhook } from "../../../utils/api";
import { useSessionQuery } from "../../../hooks/queries";

export interface SessionDetailState {
  id: string | undefined;
  isLoading: boolean;
  error: Error | undefined;
  session: SessionWithStatus | null;
  turns: TurnGroup[];
  webhookEnabled: boolean;
  activeSkills: string[];
  configuredSkills: string[];
  showTools: boolean;
  expandedTurns: Set<number>;
  displayName: string;
}

export interface SessionDetailActions {
  handleRename: (name: string) => Promise<void>;
  handleToggleWebhook: () => Promise<void>;
  togglePageTools: () => void;
  toggleTurn: (turnId: number) => void;
  refresh: () => void;
  navigate: (href: string) => void;
}

export function useSessionDetailPage(): {
  state: SessionDetailState;
  actions: SessionDetailActions;
} {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data, error, isLoading, mutate } = useSessionQuery(id);
  const [showTools, setShowTools] = useState(true);
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set());

  const session = data?.session ?? null;
  const turns = data?.turns ?? [];
  const webhookEnabled = data?.webhookEnabled ?? false;
  const activeSkills = data?.activeSkills ?? [];
  const configuredSkills = data?.configuredSkills ?? [];
  const displayName = session?.customName || `Session ${id?.slice(0, 8)}`;

  const handleRename = async (name: string) => {
    if (!id || !data) {
      return;
    }
    await updateSessionName(id, name);
    mutate();
  };

  const handleToggleWebhook = async () => {
    if (!id) {
      return;
    }
    await toggleSessionWebhook(id, !webhookEnabled);
    mutate();
  };

  const togglePageTools = () => {
    setShowTools((prev) => !prev);
    setExpandedTurns(new Set());
  };

  const toggleTurn = (turnId: number) => {
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(turnId)) {
        next.delete(turnId);
      } else {
        next.add(turnId);
      }
      return next;
    });
  };

  return {
    state: {
      id,
      isLoading,
      error,
      session,
      turns,
      webhookEnabled,
      activeSkills,
      configuredSkills,
      showTools,
      expandedTurns,
      displayName,
    },
    actions: {
      handleRename,
      handleToggleWebhook,
      togglePageTools,
      toggleTurn,
      refresh: () => mutate(),
      navigate: nav,
    },
  };
}
