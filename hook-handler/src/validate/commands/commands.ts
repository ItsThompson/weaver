import { spawnSync } from "node:child_process";
import { MAX_OUTPUT_LENGTH } from "@weaver/shared/types";

export function substituteVars(
  command: string,
  vars: Record<string, string>,
): string {
  let result = command;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, val);
  }
  return result;
}

export function commandUsesVar(command: string, varName: string): boolean {
  return command.includes(`{{${varName}}}`);
}

export function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
): {
  output: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
} {
  const start = Date.now();
  const result = spawnSync(command, {
    shell: true,
    cwd,
    timeout: timeoutMs,
    encoding: "utf-8",
  });
  const durationMs = Date.now() - start;
  const output = ((result.stdout || "") + (result.stderr || "")).slice(
    0,
    MAX_OUTPUT_LENGTH,
  );
  const timedOut =
    result.signal === "SIGTERM" ||
    result.error?.message?.includes("ETIMEDOUT") === true;
  return { output, exitCode: result.status, timedOut, durationMs };
}
