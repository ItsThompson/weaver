import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { globalKiroDir } from "../paths";
import { readProjectConfig } from "@weaver/shared/sync";
import {
  calculateStopTimeout,
  calculatePostToolUseTimeout,
} from "@weaver/shared/sync";
import { patchAgentConfig } from "./patch-agent-config";
import type { SyncOptions, SyncResult } from "@weaver/shared/sync";

/**
 * Reads `.weaver.json` from `cwd`, calculates the required kiro-cli hook
 * timeouts, and patches all agent config files containing `weaver-log.sh`
 * hooks in both workspace (`.kiro/agents/`) and global (`~/.kiro/agents/`)
 * directories.
 */
export function syncAgentTimeouts(
  cwd: string,
  options?: SyncOptions,
): SyncResult {
  const result: SyncResult = { patched: [], skipped: [], errors: [] };

  const config = readProjectConfig(cwd);
  if (!config?.validation) {
    return result;
  }

  const stopTimeout = config.validation.stop?.length
    ? calculateStopTimeout(config.validation.stop)
    : null;
  const postToolUseTimeout = config.validation.postToolUse?.length
    ? calculatePostToolUseTimeout(config.validation.postToolUse)
    : null;

  if (!stopTimeout && !postToolUseTimeout) {
    return result;
  }

  const agentDirs = [
    join(cwd, ".kiro", "agents"),
    join(globalKiroDir(), "agents"),
  ];

  agentDirs.forEach((dir) => {
    if (!existsSync(dir)) {
      return;
    }

    readdirSync(dir).reduce<void>((_, file) => {
      if (!file.endsWith(".json")) {
        return;
      }
      patchAgentConfig(
        join(dir, file),
        stopTimeout,
        postToolUseTimeout,
        result,
        options?.dryRun ?? false,
      );
    }, undefined);
  });

  return result;
}
