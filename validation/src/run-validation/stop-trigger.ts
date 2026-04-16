import { relative, resolve } from "node:path";
import { groupFilesByConfig, resolveTestRunners } from "../config/index";
import {
  extractChangedFiles,
  extractAgentTestedDirs,
  isWithinDir,
} from "../session-analysis";
import { runStopHook } from "../stop-hook";
import { writeValidationEvent } from "../logging";
import { handleExitLogic } from "../exit";
import type { ValidateResult } from "../exit";
import type { ValidationResult } from "@weaver/shared/types";
import type { ValidateArgs } from "./parse-args";

export function runStopTrigger(
  args: ValidateArgs,
  sessionLogPath: string,
): ValidateResult {
  const changedFiles = extractChangedFiles(sessionLogPath);
  if (!changedFiles.length) {
    return { exitCode: 0 };
  }

  const groups = groupFilesByConfig(changedFiles);
  if (groups.size === 0) {
    return { exitCode: 0 };
  }

  const allResults: ValidationResult[] = [];

  groups.forEach(({ config, files }, configRoot) => {
    if (!config.validation?.stop?.length) {
      return;
    }

    const testRunners = resolveTestRunners(config);
    const rawTestedDirs = extractAgentTestedDirs(
      sessionLogPath,
      args.cwd,
      testRunners,
    );
    const agentTestedDirs = rawTestedDirs.reduce<string[]>((acc, dir) => {
      const abs = resolve(args.cwd, dir);
      if (isWithinDir(abs, configRoot)) {
        acc.push(relative(configRoot, abs));
      }
      return acc;
    }, []);

    const results = config.validation.stop.map((hook) =>
      runStopHook(hook, files, agentTestedDirs, configRoot),
    );

    writeValidationEvent(
      sessionLogPath,
      args.sessionId,
      "stop",
      results,
      files,
      agentTestedDirs,
    );
    allResults.push(...results);
  });

  if (!allResults.length) {
    return { exitCode: 0 };
  }
  return handleExitLogic(args.sessionId, allResults);
}
