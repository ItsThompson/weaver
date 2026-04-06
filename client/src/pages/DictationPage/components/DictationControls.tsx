import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import type { DictationControlsProps } from "../types";

export function DictationControls({
  phase,
  hotkeyActive,
  whisperReady,
  ollamaReady,
  hasProcessedText,
  onStart,
  onStop,
  onCopy,
}: DictationControlsProps) {
  const servicesReady = whisperReady && ollamaReady;
  const disabled = hotkeyActive || !servicesReady || phase === "idle";
  const isRecording = phase === "recording" || phase === "starting";

  return (
    <SpaceBetween size="xs" direction="horizontal">
      {isRecording ? (
        <Button
          variant="primary"
          onClick={onStop}
          disabled={hotkeyActive || phase === "starting"}
          loading={phase === "starting"}
        >
          {phase === "starting" ? "Starting..." : "Stop Dictation"}
        </Button>
      ) : (
        <Button
          variant="primary"
          onClick={onStart}
          disabled={disabled || phase === "processing"}
        >
          Start Dictation
        </Button>
      )}
      <Button onClick={onCopy} disabled={!hasProcessedText}>
        Copy to Clipboard
      </Button>
    </SpaceBetween>
  );
}
