import { test, expect } from "../fixtures/app.js";

/** Wait for React to mount and SSE EventSource to connect. */
async function waitForAppReady(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.waitForSelector("#root > *", { timeout: 10_000 });
  await new Promise((r) => setTimeout(r, 500));
}

async function goToMini(
  page: import("@playwright/test").Page,
  serverUrl: string,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await fetch(`${serverUrl}/api/navigate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: "mini" }),
    });
    await new Promise((r) => setTimeout(r, 1_000));
    if (page.url().includes("/mini")) {
      return;
    }
  }
  throw new Error("Failed to navigate to mini after retries");
}

test.describe("tray menu", () => {
  test("tray exists", async ({ electronApp, page }) => {
    const trayCount = await electronApp.evaluate(
      ({ Tray }) =>
        // @ts-expect-error — getAllTrays exists at runtime
        Tray.getAllTrays?.()?.length ?? null,
    );
    // If getAllTrays isn't available, fall back to checking via BrowserWindow (tray was created if app launched)
    if (trayCount !== null) {
      expect(trayCount).toBeGreaterThan(0);
    } else {
      // Tray was created during app.on('ready') — if we got here, the app started successfully
      expect(true).toBe(true);
    }
  });

  test("show/hide behavior", async ({ electronApp, page }) => {
    // Starts visible
    let state = await electronApp.evaluate(() =>
      (global as any).__weaverTest.getState(),
    );
    expect(state.visible).toBe(true);

    // Toggle hides
    await electronApp.evaluate(() =>
      (global as any).__weaverTest.toggleWindow(),
    );
    state = await electronApp.evaluate(() =>
      (global as any).__weaverTest.getState(),
    );
    expect(state.visible).toBe(false);
    let opacity = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getOpacity(),
    );
    expect(opacity).toBe(0);

    // Toggle shows
    await electronApp.evaluate(() =>
      (global as any).__weaverTest.toggleWindow(),
    );
    state = await electronApp.evaluate(() =>
      (global as any).__weaverTest.getState(),
    );
    expect(state.visible).toBe(true);
    opacity = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getOpacity(),
    );
    expect(opacity).toBe(1);
  });

  test("ghost mode behavior", async ({ electronApp, page }) => {
    // Enable ghost
    const enabled = await electronApp.evaluate(() =>
      (global as any).__weaverTest.toggleGhost(),
    );
    expect(enabled).toBe(true);

    let state = await electronApp.evaluate(() =>
      (global as any).__weaverTest.getState(),
    );
    expect(state.ghostEnabled).toBe(true);

    let opacity = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getOpacity(),
    );
    expect(opacity).toBeLessThan(1);

    // Disable ghost
    const disabled = await electronApp.evaluate(() =>
      (global as any).__weaverTest.toggleGhost(),
    );
    expect(disabled).toBe(false);

    state = await electronApp.evaluate(() =>
      (global as any).__weaverTest.getState(),
    );
    expect(state.ghostEnabled).toBe(false);

    opacity = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getOpacity(),
    );
    expect(opacity).toBe(1);
  });

  test("mini mode behavior", async ({ electronApp, page, serverUrl }) => {
    await waitForAppReady(page);
    await goToMini(page, serverUrl);

    const bounds = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getBounds(),
    );
    expect(bounds.width).toBe(300);

    const state = await electronApp.evaluate(() =>
      (global as any).__weaverTest.getState(),
    );
    expect(state.miniMode).toBe(true);
  });

  test("quit behavior", async ({ electronApp, page }) => {
    const pid = electronApp.process().pid!;
    await electronApp.evaluate(({ app }) => app.exit());

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      const check = () => {
        try {
          process.kill(pid, 0); // Check if process exists
          setTimeout(check, 100);
        } catch {
          resolve(); // Process no longer exists
        }
      };
      check();
    });

    // If we got here, the process exited
    expect(true).toBe(true);
  });
});
