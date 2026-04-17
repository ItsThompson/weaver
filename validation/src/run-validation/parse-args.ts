import { Harness, resolveToolName } from "@weaver/shared/types";
import type { ValidationTrigger } from "@weaver/shared/types";

export interface ValidateArgs {
  sessionId: string;
  cwd: string;
  trigger: ValidationTrigger;
  harness: Harness;
  toolName?: string;
  toolPath?: string;
}

const VALID_HARNESSES = new Set<string>(Object.values(Harness));

/**
 * Normalizes trigger values from all harnesses to the camelCase
 * form the validation pipeline expects. Handles:
 * - camelCase (kiro-cli): stop, postToolUse, preToolUse
 * - PascalCase (Claude Code): Stop, PostToolUse, PreToolUse
 * - kebab-case (pi): stop, post-tool-use, pre-tool-use
 */
const TRIGGER_MAP: Record<string, ValidationTrigger> = {
  stop: "stop",
  Stop: "stop",
  postToolUse: "postToolUse",
  PostToolUse: "postToolUse",
  "post-tool-use": "postToolUse",
  preToolUse: "preToolUse",
  PreToolUse: "preToolUse",
  "pre-tool-use": "preToolUse",
};

export function parseArgs(argv: string[]): ValidateArgs {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const val = argv[i + 1];
    if (key && val) {
      args[key] = val;
    }
  }
  const harness = args["harness"] ?? "kiro-cli";
  const rawTrigger = args["trigger"];
  return {
    sessionId: args["session-id"],
    cwd: args["cwd"],
    trigger: TRIGGER_MAP[rawTrigger] ?? "stop",
    harness: VALID_HARNESSES.has(harness)
      ? (harness as Harness)
      : Harness.KIRO_CLI,
    toolName: args["tool-name"] ? resolveToolName(args["tool-name"]) : undefined,
    toolPath: args["tool-path"],
  };
}
