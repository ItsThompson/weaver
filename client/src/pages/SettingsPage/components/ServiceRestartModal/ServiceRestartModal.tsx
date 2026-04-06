import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";

interface ServiceRestartModalProps {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ServiceRestartModal({
  visible,
  onConfirm,
  onCancel,
}: ServiceRestartModalProps) {
  return (
    <Modal
      visible={visible}
      onDismiss={onCancel}
      header="Restart services?"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={onCancel}>Cancel</Button>
            <Button variant="primary" onClick={onConfirm}>
              Save and restart services
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      These changes require dictation services to restart. The app will briefly
      return to the startup screen while services reinitialize.
    </Modal>
  );
}
