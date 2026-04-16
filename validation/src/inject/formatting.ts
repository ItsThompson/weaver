import type { ValidationResult } from "@weaver/shared/types";
import { formatDuration } from "@weaver/shared/utils";

export interface PendingFile {
  results: ValidationResult[];
}

export function formatResult(r: ValidationResult): string {
  if (r.skipped_reason) {
    return `⊘ ${r.name} — skipped (${r.skipped_reason})`;
  }
  const dur = formatDuration(r.duration_ms);
  if (r.passed) {
    return `✓ ${r.name} (${dur})`;
  }
  const header = `✗ ${r.name} (${dur}${r.timed_out ? ", timed out" : ""})`;
  if (!r.output) {
    return header;
  }

  const lines = r.output.trimEnd().split("\n");
  const indented = lines.map((line) => `  ${line}`).join("\n");
  return `${header}\n${indented}`;
}

export function formatPendingOutput(results: ValidationResult[]): string {
  const { passed, failed, skipped, failedDetails } = results.reduce(
    (acc, result) => {
      if (result.skipped_reason) {
        acc.skipped++;
      } else if (result.passed) {
        acc.passed++;
      } else {
        acc.failed++;
        acc.failedDetails.push(formatResult(result));
      }
      return acc;
    },
    { passed: 0, failed: 0, skipped: 0, failedDetails: [] as string[] },
  );

  const summary = [
    passed && `${passed} passed`,
    failed && `${failed} failed`,
    skipped && `${skipped} skipped`,
  ]
    .filter(Boolean)
    .join(" · ");

  const sections = [
    "[Weaver Validation — Previous Turn]",
    summary,
    ...failedDetails,
    ...(failed > 0 ? ["Re-run failing commands for full output."] : []),
  ];

  return sections.join("\n\n") + "\n";
}
