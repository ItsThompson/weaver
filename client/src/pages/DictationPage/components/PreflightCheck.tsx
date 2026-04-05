import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import type { PreflightCheckProps } from "../types";

export function PreflightCheck({
  whisperStatus,
  ollamaStatus,
  phase,
}: PreflightCheckProps) {
  const loading = phase === "idle" || phase === "preflight_checking";

  function indicatorType(ready: boolean) {
    if (loading) {
      return "warning";
    }
    return ready ? "success" : "error";
  }

  return (
    <SpaceBetween size="xs" direction="horizontal">
      <StatusIndicator type={indicatorType(whisperStatus)}>
        {loading ? "Whisper: checking..." : "Whisper"}
      </StatusIndicator>
      <StatusIndicator type={indicatorType(ollamaStatus)}>
        {loading ? "Ollama: checking..." : "Ollama"}
      </StatusIndicator>
    </SpaceBetween>
  );
}
