import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import type { PreflightCheckProps } from "../types";

export function PreflightCheck({
  whisperStatus,
  ollamaStatus,
}: PreflightCheckProps) {
  return (
    <SpaceBetween size="xs" direction="horizontal">
      <StatusIndicator type={whisperStatus ? "success" : "error"}>
        Whisper
      </StatusIndicator>
      <StatusIndicator type={ollamaStatus ? "success" : "error"}>
        Ollama
      </StatusIndicator>
    </SpaceBetween>
  );
}
