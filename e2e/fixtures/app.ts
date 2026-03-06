import { test as base, type ElectronApplication, type Page } from "@playwright/test";
import { _electron } from "playwright";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const MAIN_ENTRY = join(REPO_ROOT, "desktop/dist/main.cjs");
const SERVER_URL = "http://localhost:8143";

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
    // app.close() calls app.quit() which is blocked by the window's
    // close handler (e.preventDefault()). Use app.exit() to force shutdown.
    await app.evaluate(({ app }) => app.exit());
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
