import type { DictationPhase } from "../../hooks/useDictation";

export interface PreflightCheckProps {
  whisperStatus: boolean;
  ollamaStatus: boolean;
}

export interface TranscriptPanelProps {
  rawTranscript: string;
  processedText: string;
  phase: DictationPhase;
}

export interface DictationControlsProps {
  phase: DictationPhase;
  f4Active: boolean;
  whisperReady: boolean;
  ollamaReady: boolean;
  hasProcessedText: boolean;
  onStart: () => void;
  onStop: () => void;
  onCopy: () => void;
}
