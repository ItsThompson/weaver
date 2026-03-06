import { test as base, type ElectronApplication, type Page } from "@playwright/test";
import { _electron } from "playwright";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const MAIN_ENTRY = join(REPO_ROOT, "desktop/dist/main.cjs");
const SERVER_URL = "http://localhost:8143";
const SERVER_PORT = 8143;

export type AppFixtures = {
  tmpDir: string;
  electronApp: ElectronApplication;
  serverUrl: string;
  page: Page;
};

async function waitForServer(url: string, retries = 30): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server failed to start");
}

export const test = base.extend<AppFixtures>({
  tmpDir: async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), "weaver-e2e-"));
    await mkdir(join(dir, ".weaver", "logs"), { recursive: true });
    await use(dir);
    await rm(dir, { recursive: true, force: true });
  },

  electronApp: async ({ tmpDir }, use) => {
    const app = await _electron.launch({
      args: [MAIN_ENTRY],
      cwd: REPO_ROOT,
      env: { ...process.env, HOME: tmpDir, USERPROFILE: tmpDir },
    });
    await use(app);
    // Kill the forked server process first (app.exit() doesn't fire will-quit,
    // so server.stop() never runs). Then kill the Electron process.
    await app.evaluate(() => {
      try {
        require("child_process").execSync(
          "kill -9 $(lsof -ti tcp:8143 -sTCP:LISTEN)",
          { stdio: "ignore" },
        );
      } catch {}
    });
    app.process().kill("SIGKILL");
  },

  serverUrl: async ({}, use) => {
    await use(SERVER_URL);
  },

  page: async ({ electronApp, serverUrl }, use) => {
    await waitForServer(serverUrl);
    const page = await electronApp.firstWindow();
    await use(page);
  },
});

export { expect } from "@playwright/test";

export function killPort(port: number): void {
  try {
    const pids = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8" }).trim();
    if (pids) {
      for (const pid of pids.split("\n")) process.kill(Number(pid), "SIGKILL");
    }
  } catch {}
}

export { REPO_ROOT, MAIN_ENTRY, SERVER_URL };
