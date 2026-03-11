import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
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
    const pendingPath = join(
      homedir(),
      ".weaver",
      "logs",
      `${sessionId}.pending`,
    );
    try {
      writeFileSync(pendingPath, JSON.stringify({ results }));
    } catch (e) {
      console.error("Failed to write pending file:", pendingPath, e);
    }
    const names = failed.map((r) => r.name).join(", ");
    return {
      exitCode: 1,
      stderr: `⚠ weaver: ${failed.length}/${total} validations failed (${names})\n`,
    };
  }
  return { exitCode: 0 };
}
