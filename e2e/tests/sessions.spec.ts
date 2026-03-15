import { test, expect } from "../fixtures/app";
import { seedSession, seedLogEvents, makeHookEvent } from "../fixtures/seed";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test.describe("Session CRUD", () => {
  test("empty state returns empty array", async ({ page, serverUrl }) => {
    const res = await fetch(`${serverUrl}/api/sessions`);
    expect(res.status).toBe(200);
    const sessions = await res.json();
    expect(sessions).toEqual([]);
  });

  test("seeded sessions appear sorted by startTime desc", async ({
    page,
    serverUrl,
    tmpDir,
  }) => {
    const older = await seedSession(tmpDir, {
      startTime: "2026-01-01T00:00:00.000Z",
    });
    const newer = await seedSession(tmpDir, {
      startTime: "2026-02-01T00:00:00.000Z",
    });

    const res = await fetch(`${serverUrl}/api/sessions`);
    expect(res.status).toBe(200);
    const sessions = await res.json();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe(newer.id);
    expect(sessions[1].id).toBe(older.id);
  });

  test("session detail with turns", async ({ page, serverUrl, tmpDir }) => {
    const session = await seedSession(tmpDir, {});
    const events = [
      makeHookEvent({
        timestamp: "2026-01-01T00:00:00.000Z",
        event: {
          hook_event_name: "userPromptSubmit",
          cwd: "/tmp",
          prompt: "hello",
        },
      }),
      makeHookEvent({
        timestamp: "2026-01-01T00:00:01.000Z",
        event: { hook_event_name: "stop", cwd: "/tmp" },
      }),
    ];
    await seedLogEvents(tmpDir, session.id, events);

    const res = await fetch(`${serverUrl}/api/sessions/${session.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.id).toBe(session.id);
    expect(body.turns.length).toBeGreaterThanOrEqual(1);
    expect(body.turns[0].userPrompt).toBe("hello");
  });

  test("rename session", async ({ page, serverUrl, tmpDir }) => {
    const session = await seedSession(tmpDir, {});

    const patchRes = await fetch(`${serverUrl}/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customName: "my-session" }),
    });
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.customName).toBe("my-session");

    // Verify persisted
    const getRes = await fetch(`${serverUrl}/api/sessions/${session.id}`);
    const { session: fetched } = await getRes.json();
    expect(fetched.customName).toBe("my-session");
  });

  test("delete session removes from list and disk", async ({
    page,
    serverUrl,
    tmpDir,
  }) => {
    const session = await seedSession(tmpDir, {});
    await seedLogEvents(tmpDir, session.id, [makeHookEvent()]);
    const logPath = join(tmpDir, ".weaver", "logs", `${session.id}.jsonl`);

    // Verify log file exists
    await readFile(logPath);

    const delRes = await fetch(`${serverUrl}/api/sessions/${session.id}`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(200);
    const body = await delRes.json();
    expect(body.ok).toBe(true);

    // Session gone from list
    const listRes = await fetch(`${serverUrl}/api/sessions`);
    const sessions = await listRes.json();
    expect(sessions.find((s: any) => s.id === session.id)).toBeUndefined();

    // Log file deleted
    await expect(readFile(logPath)).rejects.toThrow();
  });

  test("get non-existent session returns 404", async ({ page, serverUrl }) => {
    const res = await fetch(`${serverUrl}/api/sessions/fake-id`);
    expect(res.status).toBe(404);
  });

  test("delete non-existent session returns 404", async ({
    page,
    serverUrl,
  }) => {
    const res = await fetch(`${serverUrl}/api/sessions/fake-id`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});
