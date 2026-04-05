import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import Alert from "@cloudscape-design/components/alert";
import { useDictationPage } from "./hooks/useDictationPage";
import { PreflightCheck } from "./components/PreflightCheck";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { DictationControls } from "./components/DictationControls";

export function DictationPage() {
  const { state, actions } = useDictationPage();

  return (
    <SpaceBetween size="l">
      <Header variant="h1">Dictation</Header>

      {state.f4Active && (
        <Alert type="info">
          Dictation in progress via F4 shortcut. Controls are disabled.
        </Alert>
      )}

      {state.phase === "error" && state.error && (
        <Alert type="error">{state.error}</Alert>
      )}

      <PreflightCheck
        whisperStatus={state.whisperStatus}
        ollamaStatus={state.ollamaStatus}
      />

      <DictationControls
        phase={state.phase}
        f4Active={state.f4Active}
        whisperReady={state.whisperStatus}
        ollamaReady={state.ollamaStatus}
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
  );
}
