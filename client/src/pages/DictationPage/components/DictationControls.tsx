import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import type { DictationControlsProps } from "../types";

export function DictationControls({
  phase,
  f4Active,
  whisperReady,
  ollamaReady,
  hasProcessedText,
  onStart,
  onStop,
  onCopy,
}: DictationControlsProps) {
  const servicesReady = whisperReady && ollamaReady;
  const disabled = f4Active || !servicesReady;
  const isRecording = phase === "recording";

  return (
    <SpaceBetween size="xs" direction="horizontal">
      {isRecording ? (
        <Button variant="primary" onClick={onStop} disabled={f4Active}>
          Stop Dictation
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
      <Button variant="link" href="/snippets">
        Manage Snippets
      </Button>
    </SpaceBetween>
  );
}
