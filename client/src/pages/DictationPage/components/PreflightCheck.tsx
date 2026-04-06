import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Popover from "@cloudscape-design/components/popover";
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

interface CheckResult {
  label: string;
  passed: boolean;
  detail?: string | null;
}

function buildChecks(
  whisperStatus: boolean,
  ollamaStatus: boolean,
  ollamaError: "not_installed" | "model_not_found" | null,
  micStatus?: "loading" | "success" | "warning" | "error",
  micLabel?: string,
): CheckResult[] {
  const checks: CheckResult[] = [
    { label: "Whisper", passed: whisperStatus },
    {
      label: "Ollama",
      passed: ollamaStatus,
      detail: !ollamaStatus ? ollamaHelpText(ollamaError) : null,
    },
  ];
  if (micStatus) {
    checks.push({
      label: "Microphone",
      passed: micStatus === "success",
      detail:
        micStatus !== "success" && micStatus !== "loading" ? micLabel : null,
    });
  }
  return checks;
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

  if (loading) {
    return (
      <StatusIndicator type="in-progress">Checking services...</StatusIndicator>
    );
  }

  const checks = buildChecks(
    whisperStatus,
    ollamaStatus,
    ollamaError,
    micStatus,
    micLabel,
  );
  const passedCount = checks.filter((check) => check.passed).length;
  const allPassed = passedCount === checks.length;

  return (
    <Popover
      header="Preflight checks"
      content={
        <SpaceBetween size="xs">
          {checks.map((check) => (
            <div key={check.label}>
              <StatusIndicator type={check.passed ? "success" : "error"}>
                {check.label}
              </StatusIndicator>
              {check.detail && (
                <Box
                  color="text-status-error"
                  fontSize="body-s"
                  padding={{ left: "l" }}
                >
                  {check.detail}
                </Box>
              )}
            </div>
          ))}
        </SpaceBetween>
      }
      triggerType="custom"
    >
      <StatusIndicator type={allPassed ? "success" : "error"}>
        {passedCount}/{checks.length} checks passed
      </StatusIndicator>
    </Popover>
  );
}
