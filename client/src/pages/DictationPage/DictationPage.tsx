import { useEffect } from "react";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import Alert from "@cloudscape-design/components/alert";
import Link from "@cloudscape-design/components/link";
import { useDictation } from "../../hooks/useDictation";
import { PreflightCheck } from "./components/PreflightCheck";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { DictationControls } from "./components/DictationControls";
import { ModelDownload } from "./components/ModelDownload";

function ollamaErrorAlert(
  error: "not_installed" | "model_not_found" | null,
  model: string,
): React.ReactNode {
  if (error === "not_installed") {
    return (
      <>
        Ollama is required for LLM cleanup. Install it from{" "}
        <Link href="https://ollama.com" external>
          ollama.com
        </Link>{" "}
        or run <code>brew install ollama</code>, then pull a model:{" "}
        <code>ollama pull {model}</code>. You can also disable LLM cleanup in
        Settings to use dictation without Ollama.
      </>
    );
  }
  if (error === "model_not_found") {
    return (
      <>
        The configured model <strong>{model}</strong> is not available in
        Ollama. Pull it by running <code>ollama pull {model}</code>.
      </>
    );
  }
  return null;
}

export function DictationPage() {
  const { state, actions } = useDictation();

  useEffect(() => {
    actions.checkServices();
  }, [actions.checkServices]);

  const noModel =
    !state.hasModel &&
    state.phase !== "preflight_checking" &&
    state.phase !== "idle";

  const ollamaAlert =
    state.phase === "error" && !state.ollamaStatus && !noModel
      ? ollamaErrorAlert(state.ollamaError, state.ollamaModel)
      : null;

  return (
    <SpaceBetween size="l">
      <Header variant="h1">Dictation</Header>

      {state.f4Active && (
        <Alert type="info">
          Dictation in progress via F4 shortcut. Controls are disabled.
        </Alert>
      )}

      {ollamaAlert ? (
        <Alert type="error">{ollamaAlert}</Alert>
      ) : (
        state.phase === "error" &&
        state.error &&
        !noModel && <Alert type="error">{state.error}</Alert>
      )}

      <PreflightCheck
        whisperStatus={state.whisperStatus}
        ollamaStatus={state.ollamaStatus}
        ollamaError={state.ollamaError}
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
