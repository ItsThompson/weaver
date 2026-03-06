import { test, expect } from "../fixtures/app.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

test.describe("app lifecycle", () => {
  test("server starts and responds", async ({ serverUrl }) => {
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
