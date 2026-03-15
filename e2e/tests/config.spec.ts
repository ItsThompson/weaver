import { test, expect } from "../fixtures/app";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test.describe("Config lifecycle", () => {
  test("default config on fresh start", async ({ page, serverUrl }) => {
    const res = await fetch(`${serverUrl}/api/config`);
    expect(res.status).toBe(200);
    const { config } = await res.json();
    expect(config.dark_mode).toBe(true);
    expect(config.page_size).toBe(25);
    expect(config.ghost_mode).toBe(false);
    expect(config.ghost_opacity).toBe(0.5);
    expect(config.webhook_url).toBe("");
    expect(config.webhook_format).toBe("simple");
    expect(config.enable_notification_sounds).toBe(true);
  });

  test("update config", async ({ page, serverUrl }) => {
    const putRes = await fetch(`${serverUrl}/api/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dark_mode: false, page_size: 50 }),
    });
    expect(putRes.status).toBe(200);
    const { config: updated } = await putRes.json();
    expect(updated.dark_mode).toBe(false);
    expect(updated.page_size).toBe(50);

    const getRes = await fetch(`${serverUrl}/api/config`);
    const { config: fetched } = await getRes.json();
    expect(fetched.dark_mode).toBe(false);
    expect(fetched.page_size).toBe(50);
  });

  test("config persists to disk", async ({ page, serverUrl, tmpDir }) => {
    await fetch(`${serverUrl}/api/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dark_mode: false, page_size: 50 }),
    });

    const raw = await readFile(join(tmpDir, ".weaver", "config.json"), "utf-8");
    const disk = JSON.parse(raw);
    expect(disk.dark_mode).toBe(false);
    expect(disk.page_size).toBe(50);
  });

  test("invalid config rejected", async ({ page, serverUrl }) => {
    const res = await fetch(`${serverUrl}/api/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhook_format: "invalid" }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("webhook_format");
  });

  test("partial invalid config rejected", async ({ page, serverUrl }) => {
    const res = await fetch(`${serverUrl}/api/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dark_mode: false, page_size: 999 }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("page_size");
  });
});
