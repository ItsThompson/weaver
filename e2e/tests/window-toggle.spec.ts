import { test, expect } from "../fixtures/app.js";

test.describe("window toggle", () => {
  test("window starts visible", async ({ electronApp, page }) => {
    const opacity = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows()[0].getOpacity();
    });
    expect(opacity).toBe(1);
  });

  test("close hides window", async ({ electronApp, page }) => {
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].close();
    });
    const opacity = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows()[0].getOpacity();
    });
    expect(opacity).toBe(0);
  });

  test("close toggles to hidden then close again stays hidden", async ({
    electronApp,
    page,
  }) => {
    // First close: visible → hidden
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].close();
    });
    const opacity1 = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows()[0].getOpacity();
    });
    expect(opacity1).toBe(0);

    // Second close: already hidden, stays hidden
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].close();
    });
    const opacity2 = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows()[0].getOpacity();
    });
    expect(opacity2).toBe(0);
  });

  test("rapid closes do not destroy window", async ({
    electronApp,
    page,
  }) => {
    for (let i = 0; i < 10; i++) {
      await electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].close();
      });
    }
    const state = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return { destroyed: win.isDestroyed(), opacity: win.getOpacity() };
    });
    expect(state.destroyed).toBe(false);
    expect(state.opacity).toBe(0);
  });

  test("window close intercepted — not destroyed", async ({
    electronApp,
    page,
  }) => {
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].close();
    });
    const state = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return {
        destroyed: win.isDestroyed(),
        opacity: win.getOpacity(),
        exists: BrowserWindow.getAllWindows().length === 1,
      };
    });
    expect(state.exists).toBe(true);
    expect(state.destroyed).toBe(false);
    expect(state.opacity).toBe(0);
  });
});
