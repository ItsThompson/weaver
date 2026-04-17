import { test, expect } from "../fixtures/app";
import {
  seedSession,
  seedLogEvents,
  makeSession,
  makeWeaverEvent,
} from "../fixtures/seed";
import { Harness, WeaverEventName } from "@weaver/shared/types";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";

test.describe("Claude Code integration", () => {
  test("claude-code session appears with correct harness", async ({
    page,
    serverUrl,
    tmpDir,
  }) => {
    const session = await seedSession(tmpDir, {
      harness: Harness.CLAUDE_CODE,
      agentName: "dev",
    });

    const res = await fetch(`${serverUrl}/api/sessions`);
    expect(res.status).toBe(200);
    const sessions = await res.json();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(session.id);
    expect(sessions[0].harness).toBe("claude-code");
    expect(sessions[0].agentName).toBe("dev");
  });

  test("claude-code session detail includes events", async ({
    page,
    serverUrl,
    tmpDir,
  }) => {
    const session = await seedSession(tmpDir, {
      harness: Harness.CLAUDE_CODE,
    });
    const events = [
      makeWeaverEvent({
        sessionId: session.id,
        harness: Harness.CLAUDE_CODE,
        timestamp: "2026-01-01T00:00:00.000Z",
        eventName: WeaverEventName.USER_PROMPT_SUBMIT,
        cwd: "/project",
        prompt: "fix the bug",
      }),
      makeWeaverEvent({
        sessionId: session.id,
        harness: Harness.CLAUDE_CODE,
        timestamp: "2026-01-01T00:00:01.000Z",
        eventName: WeaverEventName.PRE_TOOL_USE,
        cwd: "/project",
        toolName: "Read",
      }),
      makeWeaverEvent({
        sessionId: session.id,
        harness: Harness.CLAUDE_CODE,
        timestamp: "2026-01-01T00:00:02.000Z",
        eventName: WeaverEventName.POST_TOOL_USE,
        cwd: "/project",
        toolName: "Read",
      }),
      makeWeaverEvent({
        sessionId: session.id,
        harness: Harness.CLAUDE_CODE,
        timestamp: "2026-01-01T00:00:03.000Z",
        eventName: WeaverEventName.STOP,
        cwd: "/project",
      }),
    ];
    await seedLogEvents(tmpDir, session.id, events);

    const res = await fetch(`${serverUrl}/api/sessions/${session.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.id).toBe(session.id);
    expect(body.session.harness).toBe("claude-code");
    expect(body.turns.length).toBeGreaterThanOrEqual(1);
    expect(body.turns[0].userPrompt).toBe("fix the bug");
  });

  test("session dedup: duplicate session IDs resolve to one entry", async ({
    page,
    serverUrl,
    tmpDir,
  }) => {
    const sessionId = "dedup-test-session";
    const sessionsFile = join(tmpDir, ".weaver", "sessions.jsonl");

    // Simulate two SessionStart writes for the same session_id (resume scenario)
    const first = makeSession({
      id: sessionId,
      harness: Harness.CLAUDE_CODE,
      agentName: null,
      startTime: "2026-01-01T00:00:00.000Z",
      lastEventTime: "2026-01-01T00:00:00.000Z",
    });
    const second = makeSession({
      id: sessionId,
      harness: Harness.CLAUDE_CODE,
      agentName: "dev",
      startTime: "2026-01-01T00:00:00.000Z",
      lastEventTime: "2026-01-01T01:00:00.000Z",
    });

    await appendFile(sessionsFile, JSON.stringify(first) + "\n");
    await appendFile(sessionsFile, JSON.stringify(second) + "\n");

    const res = await fetch(`${serverUrl}/api/sessions`);
    expect(res.status).toBe(200);
    const sessions = await res.json();

    const matching = sessions.filter(
      (s: { id: string }) => s.id === sessionId,
    );
    expect(matching).toHaveLength(1);
    // Last entry wins: should have agentName "dev"
    expect(matching[0].agentName).toBe("dev");
    expect(matching[0].lastEventTime).toBe("2026-01-01T01:00:00.000Z");
  });

  test("claude-code and kiro sessions coexist", async ({
    page,
    serverUrl,
    tmpDir,
  }) => {
    const kiroSession = await seedSession(tmpDir, {
      harness: Harness.KIRO_CLI,
      startTime: "2026-01-01T00:00:00.000Z",
    });
    const ccSession = await seedSession(tmpDir, {
      harness: Harness.CLAUDE_CODE,
      startTime: "2026-02-01T00:00:00.000Z",
    });

    const res = await fetch(`${serverUrl}/api/sessions`);
    expect(res.status).toBe(200);
    const sessions = await res.json();
    expect(sessions).toHaveLength(2);

    const harnesses = sessions.map((s: { harness: string }) => s.harness);
    expect(harnesses).toContain("kiro-cli");
    expect(harnesses).toContain("claude-code");
  });
});
