export type ServiceState =
  | "running"
  | "starting"
  | "stopped"
  | "error"
  | "not_configured";

export interface ServiceStatus {
  state: ServiceState;
  error?: string;
}

export interface ServicesStatusResponse {
  ready: boolean;
  services: {
    whisper: ServiceStatus;
    ollama: ServiceStatus;
  };
}

export const SERVICE_RESTART_FIELDS = [
  "enable_dictation",
  "dictation.llm_cleanup",
  "dictation.ollama_url",
  "dictation.ollama_model",
] as const;
