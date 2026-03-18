import { resolve } from "node:path";
import { symlinkSync, readlinkSync, unlinkSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { app } from "electron";

const LINK_PATH = "/usr/local/bin/weaver";

function resolveWeaverBin(): string {
  return app.isPackaged
    ? resolve(process.resourcesPath, "bin/weaver")
    : resolve(__dirname, "../../bin/weaver");
}

function isSymlinkCurrent(target: string): boolean {
  if (!existsSync(LINK_PATH)) {
    return false;
  }
  try {
    return readlinkSync(LINK_PATH) === target;
  } catch {
    return false;
  }
}

function linkWithElevation(target: string): void {
  const script = [
    `rm -f '${LINK_PATH}'`,
    `ln -s '${target}' '${LINK_PATH}'`,
  ].join(" && ");

  execSync(
    `osascript -e 'do shell script "${script}" with administrator privileges with prompt "Weaver needs permission to install the CLI to ${LINK_PATH}."'`,
  );
}

export function installCli(): void {
  const target = resolveWeaverBin();

  if (isSymlinkCurrent(target)) {
    return;
  }

  try {
    if (existsSync(LINK_PATH)) {
      unlinkSync(LINK_PATH);
    }
    symlinkSync(target, LINK_PATH);
    console.log(`Symlinked ${LINK_PATH} → ${target}`);
  } catch {
    try {
      linkWithElevation(target);
      console.log(`Symlinked ${LINK_PATH} → ${target} (elevated)`);
    } catch (error) {
      console.warn(`CLI install skipped: ${error}`);
    }
  }
}
