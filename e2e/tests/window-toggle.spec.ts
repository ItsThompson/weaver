import { test, expect } from "../fixtures/app.js";

test.describe("window toggle", () => {
  test("window starts visible", async ({ electronApp, page }) => {
    const state = await electronApp.evaluate(() => (global as any).__weaverTest.getState());
    expect(state.visible).toBe(true);

    const opacity = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getOpacity(),
    );
    expect(opacity).toBe(1);
  });

  test("toggle hides window", async ({ electronApp, page }) => {
    await electronApp.evaluate(() => (global as any).__weaverTest.toggleWindow());

    const state = await electronApp.evaluate(() => (global as any).__weaverTest.getState());
    expect(state.visible).toBe(false);

    const opacity = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getOpacity(),
    );
    expect(opacity).toBe(0);
  });

  test("toggle shows window again", async ({ electronApp, page }) => {
    // Hide
    await electronApp.evaluate(() => (global as any).__weaverTest.toggleWindow());
    // Show
    await electronApp.evaluate(() => (global as any).__weaverTest.toggleWindow());

    const state = await electronApp.evaluate(() => (global as any).__weaverTest.getState());
    expect(state.visible).toBe(true);

    const opacity = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getOpacity(),
    );
    expect(opacity).toBe(1);
  });

  test("rapid toggles end in correct state", async ({ electronApp, page }) => {
    for (let i = 0; i < 10; i++) {
      await electronApp.evaluate(() => (global as any).__weaverTest.toggleWindow());
    }
    // 10 toggles from visible=true → even count → back to visible=true
    const state = await electronApp.evaluate(() => (global as any).__weaverTest.getState());
    expect(state.visible).toBe(true);

    const opacity = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getOpacity(),
    );
    expect(opacity).toBe(1);
  });

  test("window close intercepted — not destroyed", async ({ electronApp, page }) => {
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );

    const result = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return { destroyed: win.isDestroyed(), exists: true };
    });
    expect(result.exists).toBe(true);
    expect(result.destroyed).toBe(false);

    const state = await electronApp.evaluate(() => (global as any).__weaverTest.getState());
    expect(state.visible).toBe(false);
  });
});
