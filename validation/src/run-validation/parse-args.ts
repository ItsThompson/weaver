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
  return {
    sessionId: args["session-id"],
    cwd: args["cwd"],
    trigger: args["trigger"] as "stop" | "postToolUse",
    harness: VALID_HARNESSES.has(harness)
      ? (harness as Harness)
      : Harness.KIRO_CLI,
    toolName: args["tool-name"],
    toolPath: args["tool-path"],
  };
}
