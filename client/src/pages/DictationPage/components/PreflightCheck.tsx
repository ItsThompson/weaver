import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Box from "@cloudscape-design/components/box";
import type { PreflightCheckProps } from "../types";

function ollamaHelpText(
  error: "not_installed" | "model_not_found" | null,
): string | null {
  if (error === "not_installed") {
    return "Install Ollama from https://ollama.com or run: brew install ollama";
  }
  if (error === "model_not_found") {
    return "Pull the configured model, e.g.: ollama pull phi4-mini";
  }
  return null;
}

export function PreflightCheck({
  whisperStatus,
  ollamaStatus,
  ollamaError,
  phase,
  micStatus,
  micLabel,
}: PreflightCheckProps) {
  const loading = phase === "idle" || phase === "preflight_checking";

  function indicatorType(ready: boolean) {
    if (loading) {
      return "warning";
    }
    return ready ? "success" : "error";
  }

  const helpText =
    !loading && !ollamaStatus ? ollamaHelpText(ollamaError) : null;

  return (
    <SpaceBetween size="xs">
      <SpaceBetween size="xs" direction="horizontal">
        <StatusIndicator type={indicatorType(whisperStatus)}>
          {loading ? "Whisper: checking..." : "Whisper"}
        </StatusIndicator>
        <StatusIndicator type={indicatorType(ollamaStatus)}>
          {loading ? "Ollama: checking..." : "Ollama"}
        </StatusIndicator>
        {micStatus && (
          <StatusIndicator
            type={
              micStatus === "success"
                ? "success"
                : micStatus === "warning"
                  ? "warning"
                  : micStatus === "error"
                    ? "error"
                    : "warning"
            }
          >
            {micStatus === "loading"
              ? "Microphone: checking..."
              : `Microphone: ${micLabel}`}
          </StatusIndicator>
        )}
      </SpaceBetween>
      {helpText && (
        <Box color="text-status-error" fontSize="body-s">
          {helpText}
        </Box>
      )}
    </SpaceBetween>
  );
}
