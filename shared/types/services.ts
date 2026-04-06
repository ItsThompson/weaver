import type { WeaverConfig } from "./config";

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

function getRestartFieldValue(
  config: WeaverConfig,
  field: (typeof SERVICE_RESTART_FIELDS)[number],
): unknown {
  return (field as string)
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current !== null && typeof current === "object"
          ? (current as Record<string, unknown>)[key]
          : undefined,
      config,
    );
}

export function needsServiceRestart(
  oldConfig: WeaverConfig,
  newConfig: WeaverConfig,
): boolean {
  return SERVICE_RESTART_FIELDS.some(
    (field) =>
      getRestartFieldValue(oldConfig, field) !==
      getRestartFieldValue(newConfig, field),
  );
}
