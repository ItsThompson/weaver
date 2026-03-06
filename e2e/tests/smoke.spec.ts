import { test, expect } from "../fixtures/app.js";

test.describe("smoke", () => {
  test("app launches and has a window", async ({ page }) => {
    const title = await page.title();
    expect(title).toBeTruthy();
  });
});
