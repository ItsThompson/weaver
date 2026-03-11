import { test, expect } from "../fixtures/app.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

test.describe("app lifecycle", () => {
  test("server starts and responds", async ({ serverUrl, page }) => {
    const res = await fetch(`${serverUrl}/api/health`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  test("client renders in BrowserWindow", async ({ page }) => {
    expect(page.url()).toContain("localhost:8143");
    await page.locator("body").waitFor({ state: "visible" });
    await expect(page.locator("#root")).not.toBeEmpty();
  });

  test("data directory created", async ({ tmpDir, page }) => {
    expect(existsSync(join(tmpDir, ".weaver", "logs"))).toBe(true);
  });

  test("window properties", async ({ electronApp, page }) => {
    const props = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return {
        alwaysOnTop: win.isAlwaysOnTop(),
        resizable: win.isResizable(),
      };
    });
    expect(props.alwaysOnTop).toBe(true);
    expect(props.resizable).toBe(false);
  });

  test("dock is hidden", async ({ electronApp, page }) => {
    const dockVisible = await electronApp.evaluate(({ app }) => {
      return app.dock ? app.dock.isVisible() : null;
    });
    if (dockVisible !== null) {
      expect(dockVisible).toBe(false);
    }
  });
});

test.describe("clean shutdown", () => {
  test("quit unregisters shortcuts and exits", async ({
    electronApp,
    page,
  }) => {
    const registered = await electronApp.evaluate(({ globalShortcut }) =>
      globalShortcut.isRegistered("F5"),
    );
    expect(registered).toBe(true);

    const pid = electronApp.process().pid!;
    await electronApp.evaluate(({ app }) => app.exit());

    // Poll until process exits
    await new Promise<void>((resolve) => {
      const check = () => {
        try {
          process.kill(pid, 0);
          setTimeout(check, 100);
        } catch {
          resolve();
        }
      };
      check();
    });
  });

  test("server process terminates after quit", async ({
    electronApp,
    serverUrl,
    page,
  }) => {
    const pid = electronApp.process().pid!;

    // Destroy windows first to bypass the close handler's preventDefault,
    // then quit — this triggers will-quit which calls server.stop()
    await electronApp.evaluate(({ BrowserWindow, app }) => {
      BrowserWindow.getAllWindows().forEach((w) => w.destroy());
      app.quit();
    });

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      const check = () => {
        try {
          process.kill(pid, 0);
          setTimeout(check, 100);
        } catch {
          resolve();
        }
      };
      check();
    });

    // Server should no longer respond
    await expect(fetch(`${serverUrl}/api/health`)).rejects.toThrow();
  });

  test("window close hides but does not quit", async ({
    electronApp,
    page,
  }) => {
    // Close the window (triggers the close handler which calls preventDefault)
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].close();
    });

    // App process is still running (evaluate still works)
    const windowCount = await electronApp.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    );
    expect(windowCount).toBe(1);

    // Window still exists but is hidden
    const state = await electronApp.evaluate(() =>
      (global as any).__weaverTest.getState(),
    );
    expect(state.visible).toBe(false);
  });
});
