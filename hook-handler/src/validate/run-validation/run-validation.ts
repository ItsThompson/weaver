import { join } from "node:path";
import { homedir } from "node:os";
import type { ValidateResult } from "../exit";
import type { ValidateArgs } from "./parse-args";
import { runStopTrigger } from "./stop-trigger";
import { runPostToolUseTrigger } from "./post-tool-use-trigger";

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
    return runStopTrigger(args, sessionLogPath);
  }
  if (args.trigger === "postToolUse") {
    return runPostToolUseTrigger(args, sessionLogPath);
  }

  return { exitCode: 0 };
}
