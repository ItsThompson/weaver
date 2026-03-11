import { useState } from "react";
import Button from "@cloudscape-design/components/button";
import Input from "@cloudscape-design/components/input";
import Modal from "@cloudscape-design/components/modal";
import FormField from "@cloudscape-design/components/form-field";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";

interface RenameModalProps {
  visible: boolean;
  currentName: string | null;
  onDismiss: () => void;
  onSave: (name: string) => Promise<void>;
}

export function RenameModal({
  visible,
  currentName,
  onDismiss,
  onSave,
}: RenameModalProps) {
  const [value, setValue] = useState(currentName ?? "");

  // Sync value when modal opens with a new name
  const handleOpen = () => setValue(currentName ?? "");

  const save = async () => {
    onDismiss();
    if (value !== (currentName ?? "")) {
      await onSave(value);
    }
  };

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header="Rename session"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              Save
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <FormField label="Session name">
        <Input
          value={value}
          onChange={({ detail }) => setValue(detail.value)}
          onKeyDown={({ detail }) => {
            if (detail.key === "Enter") {
              save();
            }
          }}
          autoFocus
        />
      </FormField>
    </Modal>
  );
}
