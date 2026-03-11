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
