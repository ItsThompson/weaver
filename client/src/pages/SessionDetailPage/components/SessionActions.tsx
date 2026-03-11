import { useState } from "react";
import {
  ActionDropdown,
  type ActionItem,
} from "../../../components/ActionDropdown";
import { RenameModal } from "../../../components/RenameModal";

interface SessionActionsProps {
  showTools: boolean;
  onToggleTools: () => void;
  currentName: string | null;
  sessionPid: number;
  onRename: (name: string) => Promise<void>;
  webhookEnabled: boolean;
  onToggleWebhook: () => void;
}

export function SessionActions({
  showTools,
  onToggleTools,
  currentName,
  sessionPid,
  onRename,
  webhookEnabled,
  onToggleWebhook,
}: SessionActionsProps) {
  const [renameVisible, setRenameVisible] = useState(false);

  const actions: ActionItem[] = [
    {
      id: "toggle-tools",
      text: showTools ? "Hide tool execution" : "View tool execution",
      action: onToggleTools,
    },
    {
      id: "toggle-webhook",
      text: webhookEnabled ? "Disable webhooks" : "Enable webhooks",
      action: onToggleWebhook,
    },
    {
      id: "rename",
      text: "Rename session",
      action: () => setRenameVisible(true),
    },
    {
      id: "copy-name",
      text: "Copy session name",
      action: () => navigator.clipboard.writeText(currentName || "Unnamed"),
    },
    {
      id: "copy-pid",
      text: "Copy PID",
      action: () => navigator.clipboard.writeText(String(sessionPid)),
    },
  ];

  return (
    <>
      <ActionDropdown actions={actions}>Actions</ActionDropdown>
      <RenameModal
        visible={renameVisible}
        currentName={currentName}
        onDismiss={() => setRenameVisible(false)}
        onSave={onRename}
      />
    </>
  );
}
