import { dirname } from "node:path";
import { DEFAULT_POST_TOOL_TIMEOUT_MS } from "@weaver/shared/types";
import { findNearestConfig } from "../../config/index";
import { substituteVars, runCommand } from "../commands";
import { writeValidationEvent } from "../logging";
import { handleExitLogic } from "../exit";
import type { ValidateResult } from "../exit";
import type { ValidateArgs } from "./parse-args";

export function runPostToolUseTrigger(
  args: ValidateArgs,
  sessionLogPath: string,
): ValidateResult {
  const filePath = args.toolPath || "";
  const match = findNearestConfig(filePath ? dirname(filePath) : args.cwd);
  if (!match) {
    return { exitCode: 0 };
  }

  const hooks = match.config.validation?.postToolUse?.filter(
    (h) => h.matcher === args.toolName,
  );
  if (!hooks?.length) {
    return { exitCode: 0 };
  }

  const results = hooks.map((hook) => {
    const command = substituteVars(hook.command, { file: filePath });
    const timeout = hook.timeout_ms ?? DEFAULT_POST_TOOL_TIMEOUT_MS;
    const { output, exitCode, timedOut, durationMs } = runCommand(
      command,
      match.configRoot,
      timeout,
    );
    return {
      name: hook.name,
      passed: exitCode === 0,
      output,
      duration_ms: durationMs,
      timed_out: timedOut,
    };
  });

  writeValidationEvent(
    sessionLogPath,
    args.sessionId,
    "postToolUse",
    results,
    [],
    [],
  );
  return handleExitLogic(args.sessionId, results);
}
