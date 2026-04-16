import { sessionLogPath } from "@weaver/shared/paths";
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

  const logPath = sessionLogPath(args.sessionId);

  if (args.trigger === "stop") {
    return runStopTrigger(args, logPath);
  }
  if (args.trigger === "postToolUse") {
    return runPostToolUseTrigger(args, logPath);
  }

  return { exitCode: 0 };
}
