import { resolve, dirname } from "node:path";
import {
  symlinkSync,
  readlinkSync,
  mkdirSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { app } from "electron";
import { log } from "./utils/logger";

const HOOKS_DIR = "/usr/local/lib/weaver";

interface HookEntry {
  name: string;
  /** Relative path from resourcesPath (packaged) or repo root (dev) */
  resourcePath: string;
}

const HOOKS: HookEntry[] = [
  { name: "kiro", resourcePath: "bindings/kiro/weaver-log.sh" },
  { name: "claude-code", resourcePath: "bindings/claude-code/weaver-log.sh" },
];

function resolveHookTarget(entry: HookEntry): string {
  return app.isPackaged
    ? resolve(process.resourcesPath, entry.resourcePath)
    : resolve(__dirname, "../..", entry.resourcePath);
}

function ensureSymlink(linkPath: string, target: string): boolean {
  if (existsSync(linkPath)) {
    try {
      if (readlinkSync(linkPath) === target) {
        return false;
      }
    } catch {}
    unlinkSync(linkPath);
  }
  symlinkSync(target, linkPath);
  return true;
}

function installWithElevation(
  links: Array<{ link: string; target: string }>,
): void {
  const commands = links.flatMap(({ link, target }) => [
    `mkdir -p '${dirname(link)}'`,
    `rm -f '${link}'`,
    `ln -s '${target}' '${link}'`,
  ]);
  execSync(
    `osascript -e 'do shell script "${commands.join(" && ")}" with administrator privileges with prompt "Weaver needs permission to install hook scripts to ${HOOKS_DIR}."'`,
  );
}

export function installHooks(): void {
  const pending: Array<{ link: string; target: string }> = [];

  for (const entry of HOOKS) {
    const target = resolveHookTarget(entry);
    const link = resolve(HOOKS_DIR, entry.resourcePath);
    pending.push({ link, target });
  }

  // Try without elevation first
  try {
    for (const { link, target } of pending) {
      mkdirSync(dirname(link), { recursive: true });
      if (ensureSymlink(link, target)) {
        log({
          timestamp: new Date().toISOString(),
          event: "hook_symlinked",
          link,
          target,
        });
      }
    }
  } catch {
    try {
      installWithElevation(pending);
      pending.forEach(({ link, target }) =>
        log({
          timestamp: new Date().toISOString(),
          event: "hook_symlinked",
          link,
          target,
          elevated: true,
        }),
      );
    } catch (error) {
      log({
        timestamp: new Date().toISOString(),
        event: "hook_install_skipped",
        error: String(error),
      });
    }
  }
}
