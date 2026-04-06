export type DictationPhase =
  | "idle"
  | "ready"
  | "starting"
  | "recording"
  | "processing"
  | "done"
  | "error";

export interface DictationState {
  phase: DictationPhase;
  rawTranscript: string;
  processedText: string;
  error: string | null;
  deviceWarning: string | null;
  hotkeyActive: boolean;
}

export interface DictationActions {
  startDictation: () => void;
  stopDictation: () => void;
  copyToClipboard: () => void;
  reset: () => void;
}
