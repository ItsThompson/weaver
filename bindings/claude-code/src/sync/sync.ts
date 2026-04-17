import { join } from "node:path";
import { homedir } from "node:os";
import { readProjectConfig } from "@weaver/shared/sync";
import {
  calculateStopTimeout,
  calculatePostToolUseTimeout,
} from "@weaver/shared/sync";
import { patchSettings } from "./patch-settings";
import type { SyncOptions, SyncResult } from "@weaver/shared/sync";

/**
 * Reads `.weaver.json` from `cwd`, calculates the required Claude Code hook
 * timeouts, and patches `.claude/settings.json` at both project and global
 * scope with Weaver hook entries.
 */
export function syncClaudeCodeHooks(
  cwd: string,
  hookCommand: string,
  options?: SyncOptions,
): SyncResult {
  const result: SyncResult = { patched: [], skipped: [], errors: [] };

  const config = readProjectConfig(cwd);

  const stopTimeout = config?.validation?.stop?.length
    ? calculateStopTimeout(config.validation.stop)
    : null;
  const postToolUseTimeout = config?.validation?.postToolUse?.length
    ? calculatePostToolUseTimeout(config.validation.postToolUse)
    : null;

  const settingsFiles = [
    join(cwd, ".claude", "settings.json"),
    join(homedir(), ".claude", "settings.json"),
  ];

  settingsFiles.forEach((filePath) => {
    patchSettings(
      filePath,
      hookCommand,
      stopTimeout,
      postToolUseTimeout,
      result,
      options?.dryRun ?? false,
    );
  });

  return result;
}
