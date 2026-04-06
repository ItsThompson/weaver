import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import Alert from "@cloudscape-design/components/alert";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { MicrophoneSelector } from "../../components/MicrophoneSelector";
import { ActionDropdown } from "../../components/ActionDropdown";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { DictationControls } from "./components/DictationControls";
import { ModelDownload } from "./components/ModelDownload";
import { useDictationPage } from "./hooks/useDictationPage";

export function DictationPage() {
  const { state, actions } = useDictationPage();
  const {
    dictationState,
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
  } = state;

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

      {dictationState.phase === "error" && dictationState.error && (
        <Alert type="error">{dictationState.error}</Alert>
      )}

      {dictationEnabled && servicesLoading && (
        <StatusIndicator type="loading">
          Checking service status...
        </StatusIndicator>
      )}

      {dictationEnabled && !servicesLoading && (
        <>
          <MicrophoneSelector
            selectedDeviceId={savedDeviceId}
            onChange={actions.handleMicChange}
            disabled={isRecordingOrProcessing || hotkeyActive}
          />

          {dictationState.deviceWarning && (
            <Alert type="warning">{dictationState.deviceWarning}</Alert>
          )}

          {whisperNotConfigured ? (
            <ModelDownload onComplete={actions.refetchServices} />
          ) : (
            <SpaceBetween size="l">
              <DictationControls
                phase={dictationState.phase}
                hotkeyActive={hotkeyActive}
                whisperReady={whisperRunning ?? false}
                ollamaReady={ollamaReady ?? false}
                hasProcessedText={!!dictationState.processedText}
                onStart={actions.startDictation}
                onStop={actions.stopDictation}
                onCopy={actions.copyToClipboard}
              />

              <TranscriptPanel
                rawTranscript={dictationState.rawTranscript}
                processedText={dictationState.processedText}
                phase={dictationState.phase}
              />
            </SpaceBetween>
          )}
        </>
      )}
    </SpaceBetween>
  );
}
