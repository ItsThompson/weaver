import { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDictation } from "../../../hooks/useDictation";
import { useHotkeyDictationActive } from "../../../hooks/useHotkeyDictation";
import { useConfigQuery, revalidateConfig } from "../../../hooks/queries";
import { useAudioDevices } from "../../../hooks/useAudioDevices";
import { useServicesStatus } from "../../../hooks/useServicesStatus";
import { patchConfig } from "../../../utils/api";
import { useNotifications } from "../../../context/NotificationContext/NotificationContext";
import type { ActionItem } from "../../../components/ActionDropdown";

export function useDictationPage() {
  const navigate = useNavigate();
  const { data: configData } = useConfigQuery();
  const config = configData?.config;
  const savedDeviceId = config?.dictation?.microphone_device_id ?? "";
  const { state, actions } = useDictation(savedDeviceId);
  const { addNotification } = useNotifications();
  const hotkeyActive = useHotkeyDictationActive();
  const prevPhaseRef = useRef(state.phase);
  const { devices, loading: devicesLoading } = useAudioDevices();
  const {
    status: servicesStatus,
    loading: servicesLoading,
    refetch: refetchServices,
  } = useServicesStatus();

  const dictationEnabled = config?.enable_dictation ?? false;
  const whisperRunning = servicesStatus?.services.whisper.state === "running";
  const whisperNotConfigured =
    servicesStatus?.services.whisper.state === "not_configured";
  const hasServiceError =
    servicesStatus?.services.whisper.state === "error" ||
    servicesStatus?.services.ollama.state === "error";
  const ollamaReady =
    servicesStatus?.services.ollama.state === "running" ||
    servicesStatus?.services.ollama.state === "not_configured";

  const isRecordingOrProcessing =
    state.phase === "recording" ||
    state.phase === "starting" ||
    state.phase === "processing";

  const handleMicChange = useCallback(
    async (deviceId: string) => {
      if (!config) {
        return;
      }
      await patchConfig({
        dictation: { ...config.dictation, microphone_device_id: deviceId },
      });
      await revalidateConfig();
    },
    [config],
  );

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

  return {
    state: {
      dictationState: state,
      dictationEnabled,
      whisperRunning,
      whisperNotConfigured,
      hasServiceError,
      ollamaReady,
      hotkeyActive,
      servicesLoading,
      isRecordingOrProcessing,
      savedDeviceId,
      headerActions,
    },
    actions: {
      ...actions,
      handleMicChange,
      refetchServices,
    },
  };
}
