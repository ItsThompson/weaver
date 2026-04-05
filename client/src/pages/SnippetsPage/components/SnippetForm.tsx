import { useState } from "react";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Textarea from "@cloudscape-design/components/textarea";
import Button from "@cloudscape-design/components/button";
import type { SnippetFormProps } from "../types";

export function SnippetForm({ initial, onSave, onCancel }: SnippetFormProps) {
  const [trigger, setTrigger] = useState(initial?.trigger ?? "");
  const [expansion, setExpansion] = useState(initial?.expansion ?? "");
  const [triggerError, setTriggerError] = useState("");

  const handleSave = () => {
    if (!trigger.trim()) {
      setTriggerError("Trigger is required");
      return;
    }
    setTriggerError("");
    onSave(trigger.trim(), expansion);
  };

  return (
    <Container>
      <SpaceBetween size="s">
        <FormField label="Trigger phrase" errorText={triggerError}>
          <Input
            value={trigger}
            onChange={({ detail }) => {
              setTrigger(detail.value);
              if (triggerError) {
                setTriggerError("");
              }
            }}
            placeholder="e.g. signature"
          />
        </FormField>
        <FormField label="Expansion">
          <Textarea
            value={expansion}
            onChange={({ detail }) => setExpansion(detail.value)}
            placeholder="Text to insert when trigger is matched"
            rows={4}
          />
        </FormField>
        <SpaceBetween size="xs" direction="horizontal">
          <Button variant="primary" onClick={handleSave}>
            Save
          </Button>
          <Button variant="link" onClick={onCancel}>
            Cancel
          </Button>
        </SpaceBetween>
      </SpaceBetween>
    </Container>
  );
}
