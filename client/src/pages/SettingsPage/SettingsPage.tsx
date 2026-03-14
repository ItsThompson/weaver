import { useState, useEffect } from "react";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Toggle from "@cloudscape-design/components/toggle";
import Slider from "@cloudscape-design/components/slider";
import Input from "@cloudscape-design/components/input";
import Button from "@cloudscape-design/components/button";
import Alert from "@cloudscape-design/components/alert";
import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import { DEFAULT_CONFIG, type WeaverConfig } from "@weaver/shared/types";
import { useConfigQuery, revalidateConfig } from "../../hooks/queries";
import { updateConfig } from "../../utils/api";
import { isElectron } from "../../utils/isElectron";

export function SettingsPage() {
  const { data, isLoading } = useConfigQuery();
  const [config, setConfig] = useState<WeaverConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const warnings = data?.warnings ?? [];
  const hasWarnings = warnings.length > 0;

  useEffect(() => {
    if (data?.config) {
      setConfig(data.config);
    }
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      await updateConfig(config);
      await revalidateConfig();
      setSaveResult({ type: "success", message: "Settings saved" });
    } catch (err) {
      setSaveResult({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to save",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SpaceBetween size="l">
      <Header variant="h1">Settings</Header>
      {hasWarnings && (
        <Alert type="warning" header="Configuration warnings">
          {warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </Alert>
      )}
      {saveResult && (
        <Alert
          type={saveResult.type}
          dismissible
          onDismiss={() => setSaveResult(null)}
        >
          {saveResult.message}
        </Alert>
      )}
      <Form
        actions={
          <Button
            variant="primary"
            onClick={handleSave}
            loading={saving}
            disabled={hasWarnings || isLoading}
          >
            Save
          </Button>
        }
      >
        <Container>
          <SpaceBetween size="l">
            <FormField
              label="Notification sounds"
              description="Play sounds for session notifications"
            >
              <Toggle
                checked={config.enable_notification_sounds}
                onChange={({ detail }) =>
                  setConfig((c) => ({
                    ...c,
                    enable_notification_sounds: detail.checked,
                  }))
                }
                disabled={hasWarnings}
              />
            </FormField>
            <FormField
              label="Webhook URL"
              description="POST event payloads to this URL when session events occur (leave empty to disable)"
            >
              <Input
                value={config.webhook_url}
                onChange={({ detail }) =>
                  setConfig((c) => ({ ...c, webhook_url: detail.value }))
                }
                disabled={hasWarnings}
                placeholder="https://hooks.slack.com/services/..."
              />
            </FormField>
            <FormField
              label="Webhook format"
              description="Simple sends a single text message. Advanced sends a flat JSON payload with all fields."
            >
              <Toggle
                checked={config.webhook_format === "advanced"}
                onChange={({ detail }) =>
                  setConfig((c) => ({
                    ...c,
                    webhook_format: detail.checked ? "advanced" : "simple",
                  }))
                }
                disabled={hasWarnings}
              >
                Advanced
              </Toggle>
            </FormField>
            <FormField label="Dark mode">
              <Toggle
                checked={config.dark_mode}
                onChange={({ detail }) =>
                  setConfig((c) => ({ ...c, dark_mode: detail.checked }))
                }
                disabled={hasWarnings}
              />
            </FormField>
            {isElectron() && (
              <FormField
                label="Ghost opacity"
                description="Window opacity when ghost mode is enabled (0 = fully transparent, 1 = fully opaque)"
              >
                <Slider
                  value={config.ghost_opacity}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={({ detail }) =>
                    setConfig((c) => ({ ...c, ghost_opacity: detail.value }))
                  }
                  disabled={hasWarnings}
                  valueFormatter={(value) => `${Math.round(value * 100)}%`}
                />
              </FormField>
            )}
            <FormField
              label="Test runners"
              description="Patterns used to detect agent-run tests for validation deduplication. Entries are matched against execute_bash commands."
            >
              <AttributeEditor
                onAddButtonClick={() =>
                  setConfig((c) => ({
                    ...c,
                    test_runners: [...c.test_runners, ""],
                  }))
                }
                onRemoveButtonClick={({ detail: { itemIndex } }) =>
                  setConfig((c) => ({
                    ...c,
                    test_runners: c.test_runners.filter(
                      (_, i) => i !== itemIndex,
                    ),
                  }))
                }
                items={config.test_runners.map((r) => ({ value: r }))}
                addButtonText="Add test runner"
                removeButtonText="Remove"
                empty="No test runners configured."
                definition={[
                  {
                    label: "Command pattern",
                    control: (item: { value: string }, itemIndex: number) => (
                      <Input
                        value={item.value}
                        onChange={({ detail }) =>
                          setConfig((c) => ({
                            ...c,
                            test_runners: c.test_runners.map((r, i) =>
                              i === itemIndex ? detail.value : r,
                            ),
                          }))
                        }
                        placeholder="e.g. jest, pytest, cargo test"
                        disabled={hasWarnings}
                      />
                    ),
                  },
                ]}
                disableAddButton={hasWarnings}
              />
            </FormField>
          </SpaceBetween>
        </Container>
      </Form>
    </SpaceBetween>
  );
}
