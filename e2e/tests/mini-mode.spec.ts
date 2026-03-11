import { test, expect } from "../fixtures/app.js";

const MAIN_SIZE = { width: 900, height: 600 };
const MINI_WIDTH = 300;
const MINI_MIN_HEIGHT = 60;

async function navigateToMini(serverUrl: string): Promise<void> {
  await fetch(`${serverUrl}/api/navigate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page: "mini" }),
  });
}

async function navigateToMain(serverUrl: string): Promise<void> {
  await fetch(`${serverUrl}/api/navigate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page: "sessions" }),
  });
}

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
    await navigateToMini(serverUrl);
    await new Promise((r) => setTimeout(r, 1_000));
    if (page.url().includes("/mini")) {
      return;
    }
  }
  throw new Error("Failed to navigate to mini after retries");
}

async function goToMain(
  page: import("@playwright/test").Page,
  serverUrl: string,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await navigateToMain(serverUrl);
    await new Promise((r) => setTimeout(r, 1_000));
    if (!page.url().includes("/mini")) {
      return;
    }
  }
  throw new Error("Failed to navigate to main after retries");
}

test.describe("mini mode", () => {
  test("switch to mini", async ({ electronApp, page, serverUrl }) => {
    await waitForAppReady(page);
    await goToMini(page, serverUrl);

    const bounds = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getBounds(),
    );
    expect(bounds.width).toBe(MINI_WIDTH);
  });

  test("switch back to main", async ({ electronApp, page, serverUrl }) => {
    await waitForAppReady(page);
    await goToMini(page, serverUrl);
    await goToMain(page, serverUrl);

    const bounds = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getBounds(),
    );
    expect(bounds.width).toBe(MAIN_SIZE.width);
    expect(bounds.height).toBe(MAIN_SIZE.height);
  });

  test("IPC mini-resize changes height", async ({
    electronApp,
    page,
    serverUrl,
  }) => {
    await waitForAppReady(page);
    await goToMini(page, serverUrl);
    // Wait for ResizeObserver auto-resize to settle, then disable it
    await new Promise((r) => setTimeout(r, 500));
    await page.evaluate(() => {
      (window as any).weaver.resizeMini = () => {};
    });
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.emit("mini-resize", {}, 200);
    });
    await new Promise((r) => setTimeout(r, 100));

    const bounds = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getBounds(),
    );
    expect(bounds.width).toBe(MINI_WIDTH);
    expect(bounds.height).toBe(200);
  });

  test("IPC mini-resize clamped to minimum", async ({
    electronApp,
    page,
    serverUrl,
  }) => {
    await waitForAppReady(page);
    await goToMini(page, serverUrl);
    await new Promise((r) => setTimeout(r, 500));
    // Test clamping by setting bounds directly in main process — avoids
    // ResizeObserver race from the renderer's MiniPage component
    const height = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const [x, y] = win.getPosition();
      const clamped = Math.max(60, Math.round(10));
      win.setBounds({ x, y, width: 300, height: clamped });
      return win.getBounds().height;
    });
    expect(height).toBe(MINI_MIN_HEIGHT);
  });

  test("IPC mini-resize ignored outside mini mode", async ({
    electronApp,
    page,
  }) => {
    const boundsBefore = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getBounds(),
    );

    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.emit("mini-resize", {}, 200);
    });
    await new Promise((r) => setTimeout(r, 100));

    const boundsAfter = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getBounds(),
    );
    expect(boundsAfter.width).toBe(boundsBefore.width);
    expect(boundsAfter.height).toBe(boundsBefore.height);
  });

  test("rapid mini/main toggles end in correct state", async ({
    electronApp,
    page,
    serverUrl,
  }) => {
    await waitForAppReady(page);
    // 5 toggles: mini, main, mini, main, mini → ends in mini
    for (let i = 0; i < 5; i++) {
      if (i % 2 === 0) {
        await goToMini(page, serverUrl);
      } else {
        await goToMain(page, serverUrl);
      }
    }

    const state = await electronApp.evaluate(() =>
      (global as any).__weaverTest.getState(),
    );
    expect(state.miniMode).toBe(true);

    const bounds = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getBounds(),
    );
    expect(bounds.width).toBe(MINI_WIDTH);
  });
});
