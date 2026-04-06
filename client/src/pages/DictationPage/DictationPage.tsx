import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import Alert from "@cloudscape-design/components/alert";
import { useDictation } from "../../hooks/useDictation";
import { useHotkeyDictationActive } from "../../hooks/useHotkeyDictation";
import { useConfigQuery, revalidateConfig } from "../../hooks/queries";
import { useAudioDevices } from "../../hooks/useAudioDevices";
import { useServicesStatus } from "../../hooks/useServicesStatus";
import { patchConfig } from "../../utils/api";
import { useNotifications } from "../../context/NotificationContext/NotificationContext";
import { MicrophoneSelector } from "../../components/MicrophoneSelector";
import {
  ActionDropdown,
  type ActionItem,
} from "../../components/ActionDropdown";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { DictationControls } from "./components/DictationControls";
import { ModelDownload } from "./components/ModelDownload";

export function DictationPage() {
  const navigate = useNavigate();
  const { data: configData } = useConfigQuery();
  const config = configData?.config;
  const savedDeviceId = config?.dictation?.microphone_device_id ?? "";
  const { state, actions } = useDictation(savedDeviceId);
  const { addNotification } = useNotifications();
  const hotkeyActive = useHotkeyDictationActive();
  const prevPhaseRef = useRef(state.phase);
  const { devices, loading: devicesLoading } = useAudioDevices();
  const { status: servicesStatus, refetch: refetchServices } =
    useServicesStatus();

  const dictationEnabled = config?.enable_dictation ?? false;
  const whisperRunning = servicesStatus?.services.whisper.state === "running";
  const whisperNotConfigured =
    servicesStatus?.services.whisper.state === "not_configured";
  const hasServiceError =
    servicesStatus?.services.whisper.state === "error" ||
    servicesStatus?.services.ollama.state === "error";

  const handleMicChange = async (deviceId: string) => {
    if (!config) {
      return;
    }
    await patchConfig({
      dictation: { ...config.dictation, microphone_device_id: deviceId },
    });
    await revalidateConfig();
  };

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;
    if (prev === state.phase) {
      return;
    }

    if (state.phase === "recording") {
      addNotification("Listening...", "info");
    } else if (state.phase === "processing") {
      addNotification("Processing...", "info");
    } else if (state.phase === "done") {
      addNotification("Dictation complete", "success");
    }
  }, [state.phase, addNotification]);

  const isRecordingOrProcessing =
    state.phase === "recording" ||
    state.phase === "starting" ||
    state.phase === "processing";

  const headerActions: ActionItem[] = [
    {
      id: "manage-snippets",
      text: "Manage Snippets",
      action: () => navigate("/snippets"),
    },
    {
      id: "dictation-history",
      text: "Dictation History",
      action: () => navigate("/dictation/history"),
    },
  ];

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        actions={
          <ActionDropdown actions={headerActions}>Actions</ActionDropdown>
        }
      >
        Dictation
      </Header>

      {!dictationEnabled && (
        <Alert type="info">Dictation is disabled. Enable it in Settings.</Alert>
      )}

      {dictationEnabled && hasServiceError && (
        <Alert type="error">
          Dictation is unavailable. Check service status in Settings.
        </Alert>
      )}

      {hotkeyActive && (
        <Alert type="info">
          Dictation in progress via hotkey. Controls are disabled.
        </Alert>
      )}

      {state.phase === "error" && state.error && (
        <Alert type="error">{state.error}</Alert>
      )}

      {dictationEnabled && (
        <>
          <MicrophoneSelector
            selectedDeviceId={savedDeviceId}
            onChange={handleMicChange}
            disabled={isRecordingOrProcessing || hotkeyActive}
          />

          {state.deviceWarning && (
            <Alert type="warning">{state.deviceWarning}</Alert>
          )}

          {whisperNotConfigured ? (
            <ModelDownload onComplete={refetchServices} />
          ) : (
            <SpaceBetween size="l">
              <DictationControls
                phase={state.phase}
                hotkeyActive={hotkeyActive}
                whisperReady={whisperRunning}
                ollamaReady={
                  servicesStatus?.services.ollama.state === "running" ||
                  servicesStatus?.services.ollama.state === "not_configured"
                }
                hasProcessedText={!!state.processedText}
                onStart={actions.startDictation}
                onStop={actions.stopDictation}
                onCopy={actions.copyToClipboard}
              />

              <TranscriptPanel
                rawTranscript={state.rawTranscript}
                processedText={state.processedText}
                phase={state.phase}
              />
            </SpaceBetween>
          )}
        </>
      )}
    </SpaceBetween>
  );
}
