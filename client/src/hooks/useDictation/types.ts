export type DictationPhase =
  | "idle"
  | "preflight_checking"
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
  whisperStatus: boolean;
  ollamaStatus: boolean;
  ollamaError: "not_installed" | "model_not_found" | null;
  ollamaModel: string;
  hasModel: boolean;
  hotkeyActive: boolean;
}

export interface DictationActions {
  checkServices: () => Promise<void>;
  startDictation: () => void;
  stopDictation: () => void;
  copyToClipboard: () => void;
  reset: () => void;
}
