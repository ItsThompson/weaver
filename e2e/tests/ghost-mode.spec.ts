import {
  test,
  expect,
  MAIN_ENTRY,
  REPO_ROOT,
  SERVER_URL,
  killPort,
} from "../fixtures/app";
import { seedConfig } from "../fixtures/seed";
import { _electron } from "playwright";

test.describe("ghost mode", () => {
  test("ghost mode off by default", async ({ electronApp, page }) => {
    const state = await electronApp.evaluate(() =>
      (global as any).__weaverTest.getState(),
    );
    expect(state.ghostEnabled).toBe(false);

    const opacity = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getOpacity(),
    );
    expect(opacity).toBe(1);
  });

  test("enable ghost mode", async ({ electronApp, page }) => {
    await electronApp.evaluate(() =>
      (global as any).__weaverTest.setGhostMode(true, 0.5),
    );

    const state = await electronApp.evaluate(() =>
      (global as any).__weaverTest.getState(),
    );
    expect(state.ghostEnabled).toBe(true);

    const opacity = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getOpacity(),
    );
    expect(opacity).toBe(0.5);
  });

  test("disable ghost mode", async ({ electronApp, page }) => {
    await electronApp.evaluate(() =>
      (global as any).__weaverTest.setGhostMode(true, 0.5),
    );
    await electronApp.evaluate(() =>
      (global as any).__weaverTest.setGhostMode(false, 0.5),
    );

    const state = await electronApp.evaluate(() =>
      (global as any).__weaverTest.getState(),
    );
    expect(state.ghostEnabled).toBe(false);

    const opacity = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getOpacity(),
    );
    expect(opacity).toBe(1);
  });

  test("ghost + toggle interaction — show restores ghost opacity", async ({
    electronApp,
    page,
  }) => {
    await electronApp.evaluate(() =>
      (global as any).__weaverTest.setGhostMode(true, 0.5),
    );
    // Hide
    await electronApp.evaluate(() =>
      (global as any).__weaverTest.toggleWindow(),
    );
    // Show
    await electronApp.evaluate(() =>
      (global as any).__weaverTest.toggleWindow(),
    );

    const state = await electronApp.evaluate(() =>
      (global as any).__weaverTest.getState(),
    );
    expect(state.visible).toBe(true);
    expect(state.ghostEnabled).toBe(true);

    const opacity = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getOpacity(),
    );
    expect(opacity).toBe(0.5);
  });

  test("ghost mode from config", async ({ tmpDir }) => {
    await seedConfig(tmpDir, { ghost_mode: true, ghost_opacity: 0.3 });

    const app = await _electron.launch({
      args: [MAIN_ENTRY],
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        HOME: tmpDir,
        USERPROFILE: tmpDir,
        WEAVER_TEST: "1",
      },
    });

    try {
      // Wait for server
      for (let i = 0; i < 30; i++) {
        try {
          const res = await fetch(`${SERVER_URL}/api/health`);
          // eslint-disable-next-line max-depth
          if (res.ok) {
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 200));
      }
      await app.firstWindow();

      const state = await app.evaluate(() =>
        (global as any).__weaverTest.getState(),
      );
      expect(state.ghostEnabled).toBe(true);
      expect(state.ghostOpacityValue).toBe(0.3);

      const opacity = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].getOpacity(),
      );
      expect(opacity).toBeCloseTo(0.3, 1);
    } finally {
      killPort(8143);
      app.process().kill("SIGKILL");
    }
  });
});
