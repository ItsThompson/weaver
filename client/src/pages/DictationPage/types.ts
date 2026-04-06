import type { DictationPhase } from "../../hooks/useDictation";

export interface TranscriptPanelProps {
  rawTranscript: string;
  processedText: string;
  phase: DictationPhase;
}

export interface DictationControlsProps {
  phase: DictationPhase;
  hotkeyActive: boolean;
  whisperReady: boolean;
  ollamaReady: boolean;
  hasProcessedText: boolean;
  onStart: () => void;
  onStop: () => void;
  onCopy: () => void;
}
