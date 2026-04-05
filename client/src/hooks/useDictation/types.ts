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
  hasModel: boolean;
  f4Active: boolean;
}

export interface DictationActions {
  checkServices: () => Promise<void>;
  startDictation: () => void;
  stopDictation: () => void;
  copyToClipboard: () => void;
  reset: () => void;
}
