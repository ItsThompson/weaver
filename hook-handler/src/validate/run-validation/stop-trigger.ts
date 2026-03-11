import { readProjectConfig, resolveTestRunners } from "../../config/index";
import { extractChangedFiles } from "../../changed-files/index";
import { extractAgentTestedDirs } from "../../agent-tests/index";
import { runStopHook } from "../stop-hook";
import { writeValidationEvent } from "../logging";
import { handleExitLogic } from "../exit";
import type { ValidateResult } from "../exit";
import type { ValidateArgs } from "./parse-args";

export function runStopTrigger(
  args: ValidateArgs,
  sessionLogPath: string,
): ValidateResult {
  const config = readProjectConfig(args.cwd);
  if (!config?.validation?.stop?.length) {
    return { exitCode: 0 };
  }

  const changedFiles = extractChangedFiles(sessionLogPath);
  const testRunners = resolveTestRunners(config);
  const agentTestedDirs = extractAgentTestedDirs(
    sessionLogPath,
    args.cwd,
    testRunners,
  );
  const results = config.validation.stop.map((hook) =>
    runStopHook(hook, changedFiles, agentTestedDirs, args.cwd),
  );

  writeValidationEvent(
    sessionLogPath,
    args.sessionId,
    "stop",
    results,
    changedFiles,
    agentTestedDirs,
  );
  return handleExitLogic(args.sessionId, results);
}
