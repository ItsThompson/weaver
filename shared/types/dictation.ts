export interface Snippet {
  id: string;
  trigger: string;
  expansion: string;
}

export interface DictationLogEntry {
  timestamp: string;
  rawTranscript: string;
  processedText: string;
}

export interface WhisperModel {
  name: string;
  size: string;
  url: string;
  filename: string;
}
