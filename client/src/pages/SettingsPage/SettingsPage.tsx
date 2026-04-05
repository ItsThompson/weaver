import { useState } from "react";
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
import Spinner from "@cloudscape-design/components/spinner";
import Box from "@cloudscape-design/components/box";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { isElectron } from "../../utils/isElectron";
import { getDictationStatus } from "../../utils/api";
import { useNotifications } from "../../context/NotificationContext";
import { useSettings } from "./hooks/useSettings";
import { MicrophoneSelector } from "../../components/MicrophoneSelector";
import { TestRunnersField } from "./components/TestRunnersField";
import { SkillPathsField } from "./components/SkillPathsField";
import { SkillGraphCategoriesField } from "./components/SkillGraphCategoriesField";

export function SettingsPage() {
  const { addNotification } = useNotifications();
  const { state, actions } = useSettings(addNotification);
  const { config, saving, isLoading, warnings, hasWarnings } = state;
  const { setConfig, handleSave } = actions;
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    ollama: boolean;
  } | null>(null);

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const status = await getDictationStatus();
      setConnectionResult({ ollama: status.ollama });
    } catch {
      setConnectionResult({ ollama: false });
    } finally {
      setTestingConnection(false);
    }
  };

  if (isLoading) {
    return (
      <SpaceBetween size="l">
        <Header variant="h1">Settings</Header>
        <Spinner size="large" />
      </SpaceBetween>
    );
  }

  return (
    <SpaceBetween size="l">
      <Header variant="h1">Settings</Header>
      {hasWarnings && (
        <Alert type="warning" header="Configuration warnings">
          {warnings.map((warning, i) => (
            <div key={i}>{warning}</div>
          ))}
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
                  setConfig((prev) => ({
                    ...prev,
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
                  setConfig((prev) => ({
                    ...prev,
                    webhook_url: detail.value,
                  }))
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
                  setConfig((prev) => ({
                    ...prev,
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
                  setConfig((prev) => ({
                    ...prev,
                    dark_mode: detail.checked,
                  }))
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
                    setConfig((prev) => ({
                      ...prev,
                      ghost_opacity: detail.value,
                    }))
                  }
                  disabled={hasWarnings}
                  valueFormatter={(value) => `${Math.round(value * 100)}%`}
                />
              </FormField>
            )}
            <TestRunnersField
              config={config}
              setConfig={setConfig}
              disabled={hasWarnings}
            />
            <SkillPathsField
              config={config}
              setConfig={setConfig}
              disabled={hasWarnings}
            />
            <SkillGraphCategoriesField
              config={config}
              setConfig={setConfig}
              disabled={hasWarnings}
            />
            {isElectron() && (
              <>
                <Header variant="h3">Dictation</Header>
                <FormField
                  label="Microphone"
                  description="Select which microphone to use for dictation"
                >
                  <MicrophoneSelector
                    selectedDeviceId={config.dictation.microphone_device_id}
                    onChange={(deviceId) =>
                      setConfig((prev) => ({
                        ...prev,
                        dictation: {
                          ...prev.dictation,
                          microphone_device_id: deviceId,
                        },
                      }))
                    }
                    disabled={hasWarnings}
                  />
                </FormField>
                <FormField
                  label="LLM Cleanup"
                  description="Use Ollama to remove filler words and fix grammar. Disable for lower latency (whisper already adds punctuation)."
                >
                  <Toggle
                    checked={config.dictation.llm_cleanup}
                    onChange={({ detail }) =>
                      setConfig((prev) => ({
                        ...prev,
                        dictation: {
                          ...prev.dictation,
                          llm_cleanup: detail.checked,
                        },
                      }))
                    }
                    disabled={hasWarnings}
                  >
                    {config.dictation.llm_cleanup ? "Enabled" : "Disabled"}
                  </Toggle>
                </FormField>
                <FormField
                  label="Ollama URL"
                  description="URL of the Ollama server for LLM post-processing"
                >
                  <SpaceBetween direction="horizontal" size="xs">
                    <Box>
                      <Input
                        value={config.dictation.ollama_url}
                        onChange={({ detail }) =>
                          setConfig((prev) => ({
                            ...prev,
                            dictation: {
                              ...prev.dictation,
                              ollama_url: detail.value,
                            },
                          }))
                        }
                        disabled={hasWarnings}
                        placeholder="http://localhost:11434"
                      />
                    </Box>
                    <Button
                      onClick={handleTestConnection}
                      loading={testingConnection}
                      disabled={hasWarnings}
                    >
                      Test Connection
                    </Button>
                  </SpaceBetween>
                  {connectionResult && (
                    <Box margin={{ top: "xs" }}>
                      <StatusIndicator
                        type={connectionResult.ollama ? "success" : "error"}
                      >
                        {connectionResult.ollama
                          ? "Ollama is reachable"
                          : "Cannot reach Ollama"}
                      </StatusIndicator>
                    </Box>
                  )}
                </FormField>
                <FormField
                  label="Ollama Model"
                  description="Recommended: phi4-mini (best quality), qwen3:1.7b (fast, multilingual), gemma3:1b (smallest download)"
                >
                  <Input
                    value={config.dictation.ollama_model}
                    onChange={({ detail }) =>
                      setConfig((prev) => ({
                        ...prev,
                        dictation: {
                          ...prev.dictation,
                          ollama_model: detail.value,
                        },
                      }))
                    }
                    disabled={hasWarnings}
                    placeholder="phi4-mini"
                  />
                </FormField>
              </>
            )}
          </SpaceBetween>
        </Container>
      </Form>
    </SpaceBetween>
  );
}
