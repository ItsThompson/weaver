import { join } from "node:path";
import { homedir } from "node:os";
import { DEFAULT_POST_TOOL_TIMEOUT_MS } from "@weaver/shared/types";
import { readProjectConfig, resolveTestRunners } from "../../config/index";
import { extractChangedFiles } from "../../changed-files/index";
import { extractAgentTestedDirs } from "../../agent-tests/index";
import { substituteVars, runCommand } from "../commands";
import { runStopHook } from "../stop-hook";
import { writeValidationEvent } from "../logging";
import { handleExitLogic } from "../exit";
import type { ValidateResult } from "../exit";

export interface ValidateArgs {
  sessionId: string;
  cwd: string;
  trigger: "stop" | "postToolUse";
  toolName?: string;
  toolPath?: string;
}

export function parseArgs(argv: string[]): ValidateArgs {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const val = argv[i + 1];
    if (key && val) {
      args[key] = val;
    }
  }
  return {
    sessionId: args["session-id"],
    cwd: args["cwd"],
    trigger: args["trigger"] as "stop" | "postToolUse",
    toolName: args["tool-name"],
    toolPath: args["tool-path"],
  };
}

export function runValidation(args: ValidateArgs): ValidateResult {
  if (!args.sessionId || !args.cwd || !args.trigger) {
    return {
      exitCode: 1,
      stderr:
        "Usage: node validate.js --session-id <id> --cwd <path> --trigger <stop|postToolUse>\n",
    };
  }

  const sessionLogPath = join(
    homedir(),
    ".weaver",
    "logs",
    `${args.sessionId}.jsonl`,
  );

  if (args.trigger === "stop") {
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

  if (args.trigger === "postToolUse") {
    const config = readProjectConfig(args.cwd);
    const hooks = config?.validation?.postToolUse?.filter(
      (h) => h.matcher === args.toolName,
    );
    if (!hooks?.length) {
      return { exitCode: 0 };
    }

    const filePath = args.toolPath || "";
    const results = hooks.map((hook) => {
      const command = substituteVars(hook.command, { file: filePath });
      const timeout = hook.timeout_ms ?? DEFAULT_POST_TOOL_TIMEOUT_MS;
      const { output, exitCode, timedOut, durationMs } = runCommand(
        command,
        args.cwd,
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

  return { exitCode: 0 };
}
