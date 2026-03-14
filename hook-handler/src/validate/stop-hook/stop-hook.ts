import { join } from "node:path";
import type {
  ValidationResult,
  StopValidationHook,
} from "@weaver/shared/types";
import { DEFAULT_STOP_TIMEOUT_MS } from "@weaver/shared/types";
import { matchesExtensionGlob } from "../glob";
import { substituteVars, commandUsesVar, runCommand } from "../commands";
import { resolveTestDirs } from "../../scope/index";

export function runStopHook(
  hook: StopValidationHook,
  changedFiles: string[],
  agentTestedDirs: string[],
  cwd: string,
): ValidationResult {
  if (
    hook.run_if_files_match &&
    matchesExtensionGlob(changedFiles, hook.run_if_files_match).length === 0
  ) {
    return {
      name: hook.name,
      passed: true,
      output: "",
      duration_ms: 0,
      timed_out: false,
      skipped_reason: "no files matched run_if_files_match",
      hook_type: hook.type ?? "check",
    };
  }

  const files = changedFiles.join(" ");
  const filesCsv = changedFiles.join(",");
  const testDirs = commandUsesVar(hook.command, "test_dirs")
    ? resolveTestDirs(changedFiles, hook.scope, cwd, agentTestedDirs).join(" ")
    : "";

  if (commandUsesVar(hook.command, "files") && !files) {
    return {
      name: hook.name,
      passed: true,
      output: "",
      duration_ms: 0,
      timed_out: false,
      skipped_reason: "no changed files",
      hook_type: hook.type ?? "check",
    };
  }
  if (commandUsesVar(hook.command, "test_dirs") && !testDirs) {
    return {
      name: hook.name,
      passed: true,
      output: "",
      duration_ms: 0,
      timed_out: false,
      skipped_reason: "no test dirs after deduplication",
      hook_type: hook.type ?? "check",
    };
  }

  const command = substituteVars(hook.command, {
    files,
    files_csv: filesCsv,
    test_dirs: testDirs,
  });
  const workingDir = hook.working_dir ? join(cwd, hook.working_dir) : cwd;
  const timeout = hook.timeout_ms ?? DEFAULT_STOP_TIMEOUT_MS;
  const { output, exitCode, timedOut, durationMs } = runCommand(
    command,
    workingDir,
    timeout,
    hook.type === "test",
  );

  return {
    name: hook.name,
    passed: exitCode === 0,
    output,
    duration_ms: durationMs,
    timed_out: timedOut,
    hook_type: hook.type ?? "check",
  };
}
