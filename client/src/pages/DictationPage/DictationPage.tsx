import { useEffect } from "react";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import Alert from "@cloudscape-design/components/alert";
import { useDictation } from "../../hooks/useDictation";
import { PreflightCheck } from "./components/PreflightCheck";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { DictationControls } from "./components/DictationControls";
import { ModelDownload } from "./components/ModelDownload";

export function DictationPage() {
  const { state, actions } = useDictation();

  useEffect(() => {
    actions.checkServices();
  }, [actions.checkServices]);

  const noModel =
    !state.hasModel &&
    state.phase !== "preflight_checking" &&
    state.phase !== "idle";

  return (
    <SpaceBetween size="l">
      <Header variant="h1">Dictation</Header>

      {state.f4Active && (
        <Alert type="info">
          Dictation in progress via F4 shortcut. Controls are disabled.
        </Alert>
      )}

      {state.phase === "error" && state.error && !noModel && (
        <Alert type="error">{state.error}</Alert>
      )}

      <PreflightCheck
        whisperStatus={state.whisperStatus}
        ollamaStatus={state.ollamaStatus}
        phase={state.phase}
      />

      {noModel ? (
        <ModelDownload onComplete={actions.checkServices} />
      ) : (
        <>
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
        </>
      )}
    </SpaceBetween>
  );
}
