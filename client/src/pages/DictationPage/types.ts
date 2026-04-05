import type { DictationPhase } from "../../hooks/useDictation";

export interface PreflightCheckProps {
  whisperStatus: boolean;
  ollamaStatus: boolean;
  ollamaError: "not_installed" | "model_not_found" | null;
  phase: DictationPhase;
  micStatus?: "loading" | "success" | "warning" | "error";
  micLabel?: string;
}

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
