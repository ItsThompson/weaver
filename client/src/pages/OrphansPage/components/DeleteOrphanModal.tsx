import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Modal from "@cloudscape-design/components/modal";
import Alert from "@cloudscape-design/components/alert";
import type { DeleteTarget } from "../hooks/useOrphansPage";

interface DeleteOrphanModalProps {
  target: DeleteTarget | null;
  deleting: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
}

export function DeleteOrphanModal({
  target,
  deleting,
  onDismiss,
  onConfirm,
}: DeleteOrphanModalProps) {
  return (
    <Modal
      visible={target !== null}
      onDismiss={onDismiss}
      header="Delete orphaned events"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>
              Cancel
            </Button>
            <Button variant="primary" loading={deleting} onClick={onConfirm}>
              Delete
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <Alert type="warning">
        This will permanently delete {target?.eventCount} orphaned events for{" "}
        <strong>PID {target?.pid}</strong>. This action cannot be undone.
      </Alert>
    </Modal>
  );
}
