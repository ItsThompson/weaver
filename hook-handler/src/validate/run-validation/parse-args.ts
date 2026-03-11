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
