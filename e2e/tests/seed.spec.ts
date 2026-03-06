import { test, expect } from "@playwright/test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  makeSession,
  makeHookEvent,
  seedSession,
  seedLogEvents,
  seedConfig,
} from "../fixtures/seed";
import { WeaverDb } from "@weaver/shared/db";

test.describe("seed helpers", () => {
  let tmpDir: string;

  test.beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "weaver-seed-test-"));
    await mkdir(join(tmpDir, ".weaver"), { recursive: true });
  });

  test.afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("seedSession writes to SQLite", async () => {
    const session = await seedSession(tmpDir, { customName: "test-session" });
    const db = new WeaverDb({ dbPath: join(tmpDir, ".weaver", "weaver.sqlite3"), readonly: true });
    try {
      const row = db.getSession(session.id);
      expect(row).not.toBeNull();
      expect(row!.custom_name).toBe("test-session");
      expect(row!.pid).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  test("seedLogEvents writes messages and events to SQLite", async () => {
    const session = await seedSession(tmpDir, {});
    const events = [makeHookEvent(), makeHookEvent({ timestamp: "2026-01-01T00:00:00Z" })];
    await seedLogEvents(tmpDir, session.id, events);

    const db = new WeaverDb({ dbPath: join(tmpDir, ".weaver", "weaver.sqlite3"), readonly: true });
    try {
      const messages = db.getMessages(session.id);
      expect(messages.length).toBeGreaterThanOrEqual(1);
      const dbEvents = db.getEvents(session.id);
      expect(dbEvents).toHaveLength(2);
    } finally {
      db.close();
    }
  });

  test("seedConfig writes merged config", async () => {
    const { readFile } = await import("node:fs/promises");
    await seedConfig(tmpDir, { dark_mode: false, page_size: 50 });
    const raw = await readFile(
      join(tmpDir, ".weaver", "config.json"),
      "utf-8",
    );
    const config = JSON.parse(raw);
    expect(config.dark_mode).toBe(false);
    expect(config.page_size).toBe(50);
    expect(config.enable_notification_sounds).toBe(true);
    expect(config.ghost_mode).toBe(false);
  });

  test("makeSession returns complete object with overrides", () => {
    const session = makeSession({ pid: 12345 });
    expect(session.pid).toBe(12345);
    expect(session.id).toBeTruthy();
    expect(session.startTime).toBeTruthy();
    expect(session.cwd).toBeTruthy();
  });

  test("makeHookEvent returns complete object with overrides", () => {
    const event = makeHookEvent({
      event: { hook_event_name: "stop", cwd: "/test" },
    });
    expect(event.event.hook_event_name).toBe("stop");
    expect(event.timestamp).toBeTruthy();
  });
});
