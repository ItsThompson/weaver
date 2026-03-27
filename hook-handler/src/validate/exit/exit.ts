import { writeFileSync } from "node:fs";
import { pendingPath } from "@weaver/shared/paths";
import type { ValidationResult } from "@weaver/shared/types";

export interface ValidateResult {
  exitCode: number;
  stderr?: string;
}

export function handleExitLogic(
  sessionId: string,
  results: ValidationResult[],
): ValidateResult {
  const failed = results.filter((r) => !r.passed && !r.skipped_reason);
  const total = results.filter((r) => !r.skipped_reason).length;

  if (failed.length > 0) {
    const path = pendingPath(sessionId);
    try {
      writeFileSync(path, JSON.stringify({ results }));
    } catch (e) {
      console.error("Failed to write pending file:", path, e);
    }
    const names = failed.map((r) => r.name).join(", ");
    return {
      exitCode: 1,
      stderr: `⚠ weaver: ${failed.length}/${total} validations failed (${names})\n`,
    };
  }
  return { exitCode: 0 };
}
