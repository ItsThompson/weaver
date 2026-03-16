import { useState } from "react";
import Modal from "@cloudscape-design/components/modal";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import { isValidHex } from "../../SettingsPage/components/SkillGraphCategoriesField/utils";

interface CreateCategoryModalProps {
  visible: boolean;
  existingNames: string[];
  onDismiss: () => void;
  onCreate: (name: string, color?: string) => Promise<void>;
}

export function CreateCategoryModal({
  visible,
  existingNames,
  onDismiss,
  onCreate,
}: CreateCategoryModalProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [saving, setSaving] = useState(false);

  const nameError = existingNames.includes(name)
    ? "A category with this name already exists"
    : "";
  const colorError =
    color && !isValidHex(color) ? "Must be a hex color (e.g. #ff6b6b)" : "";
  const canSave = name.trim() !== "" && !nameError && !colorError && !saving;

  const handleCreate = async () => {
    if (!canSave) {
      return;
    }
    setSaving(true);
    try {
      await onCreate(name.trim(), color || undefined);
      setName("");
      setColor("");
      onDismiss();
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = () => {
    setName("");
    setColor("");
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      onDismiss={handleDismiss}
      header="Create category"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={handleDismiss}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              loading={saving}
              disabled={!canSave}
            >
              Create
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="l">
        <FormField label="Category name" errorText={nameError}>
          <Input
            value={name}
            onChange={({ detail }) => setName(detail.value)}
            placeholder="e.g. core"
            autoFocus
          />
        </FormField>
        <FormField
          label="Color"
          description="Optional hex color. Leave blank to use a default palette color."
          errorText={colorError}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Input
              value={color}
              onChange={({ detail }) => setColor(detail.value)}
              placeholder="#ff6b6b"
            />
            {isValidHex(color) && (
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  background: color,
                  flexShrink: 0,
                }}
              />
            )}
          </div>
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}
