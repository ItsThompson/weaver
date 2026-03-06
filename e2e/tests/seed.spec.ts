import { test, expect } from "@playwright/test";
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  makeSession,
  makeHookEvent,
  seedSession,
  seedLogEvents,
  seedConfig,
} from "../fixtures/seed";

test.describe("seed helpers", () => {
  let tmpDir: string;

  test.beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "weaver-seed-test-"));
    await mkdir(join(tmpDir, ".weaver", "logs"), { recursive: true });
  });

  test.afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("seedSession writes valid JSONL", async () => {
    const session = await seedSession(tmpDir, { customName: "test-session" });
    const raw = await readFile(
      join(tmpDir, ".weaver", "sessions.jsonl"),
      "utf-8",
    );
    const parsed = JSON.parse(raw.trim());
    expect(parsed.id).toBe(session.id);
    expect(parsed.customName).toBe("test-session");
    expect(parsed.pid).toBeGreaterThan(0);
  });

  test("seedLogEvents writes events to correct file", async () => {
    const sessionId = "test-session-id";
    const events = [makeHookEvent(), makeHookEvent({ timestamp: "2026-01-01T00:00:00Z" })];
    await seedLogEvents(tmpDir, sessionId, events);
    const raw = await readFile(
      join(tmpDir, ".weaver", "logs", `${sessionId}.jsonl`),
      "utf-8",
    );
    const lines = raw.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0].event.hook_event_name).toBe("userPromptSubmit");
    expect(lines[1].timestamp).toBe("2026-01-01T00:00:00Z");
  });

  test("seedConfig writes merged config", async () => {
    await seedConfig(tmpDir, { dark_mode: false, page_size: 50 });
    const raw = await readFile(
      join(tmpDir, ".weaver", "config.json"),
      "utf-8",
    );
    const config = JSON.parse(raw);
    expect(config.dark_mode).toBe(false);
    expect(config.page_size).toBe(50);
    // defaults preserved
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
