import { Harness } from "@weaver/shared/types";

export interface ValidateArgs {
  sessionId: string;
  cwd: string;
  trigger: "stop" | "postToolUse";
  harness: Harness;
  toolName?: string;
  toolPath?: string;
}

const VALID_HARNESSES = new Set<string>(Object.values(Harness));

/**
 * Normalizes PascalCase trigger values from Claude Code to the camelCase
 * form the validation pipeline expects. Values already in camelCase pass
 * through unchanged. Only validation-relevant triggers are mapped.
 */
const TRIGGER_MAP: Record<string, "stop" | "postToolUse"> = {
  stop: "stop",
  Stop: "stop",
  postToolUse: "postToolUse",
  PostToolUse: "postToolUse",
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
    toolName: args["tool-name"],
    toolPath: args["tool-path"],
  };
}
