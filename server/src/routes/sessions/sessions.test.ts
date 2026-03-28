import "../../__tests__/mocks/services";

import { SESSION_A, SESSION_B } from "../../__tests__/fixtures/sessions";
import {
  MULTI_TURN_EVENTS,
  SKILL_READ_EVENTS,
} from "../../__tests__/fixtures/events";
import {
  readSessions,
  writeSessions,
  isProcessRunning,
} from "../../services/storage/index";
import { parseLogFile, getLastEvent } from "../../services/log-parser/index";
import { resolveConfiguredSkills } from "../../services/skill-resolver/index";
import { broadcast } from "../../services/event-bus";
import Fastify from "fastify";
import { registerSessionRoutes } from "./sessions";

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  vi.clearAllMocks();
  server = Fastify();
  registerSessionRoutes(server);
  await server.ready();
});

afterEach(() => server.close());

describe("GET /api/sessions", () => {
  it("returns sessions sorted by startTime descending with computed status", async () => {
    vi.mocked(readSessions).mockResolvedValue([SESSION_B, SESSION_A]);
    vi.mocked(isProcessRunning).mockImplementation((pid) =>
      Promise.resolve(pid === 100),
    );

    const res = await server.inject({ method: "GET", url: "/api/sessions" });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe("aaa");
    expect(body[0].status).toBe("open");
    expect(body[1].id).toBe("bbb");
    expect(body[1].status).toBe("closed");
  });

  it("derives activity from getLastEvent for open sessions", async () => {
    vi.mocked(readSessions).mockResolvedValue([SESSION_A]);
    vi.mocked(isProcessRunning).mockResolvedValue(true);
    vi.mocked(getLastEvent).mockResolvedValue({
      name: "preToolUse",
      timestamp: new Date().toISOString(),
    });

    const res = await server.inject({ method: "GET", url: "/api/sessions" });
    const body = JSON.parse(res.body);

    expect(body[0].activity).toBe("running_tool");
  });
});

describe("GET /api/sessions/:id", () => {
  it("returns grouped turns from real events", async () => {
    vi.mocked(readSessions).mockResolvedValue([SESSION_A]);
    vi.mocked(isProcessRunning).mockResolvedValue(false);
    vi.mocked(parseLogFile).mockResolvedValue(MULTI_TURN_EVENTS);

    const res = await server.inject({
      method: "GET",
      url: "/api/sessions/aaa",
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.session.id).toBe("aaa");
    expect(body.session.status).toBe("closed");
    expect(body.turns).toHaveLength(3);
    // Turn 0: agentSpawn marker
    expect(body.turns[0].userPrompt).toBeNull();
    expect(body.turns[0].toolCalls).toHaveLength(0);
    // Turn 1: stop-only flush
    expect(body.turns[1].userPrompt).toBeNull();
    // Turn 2: user prompt with tool call
    expect(body.turns[2].userPrompt).toBe("read the file");
    expect(body.turns[2].toolCalls).toHaveLength(1);
    expect(body.turns[2].toolCalls[0].toolName).toBe("fs_read");
  });

  it("returns active skills from real events", async () => {
    vi.mocked(readSessions).mockResolvedValue([SESSION_A]);
    vi.mocked(isProcessRunning).mockResolvedValue(false);
    vi.mocked(parseLogFile).mockResolvedValue(SKILL_READ_EVENTS);
    vi.mocked(resolveConfiguredSkills).mockResolvedValue([
      "coding-practices",
      "testing",
    ]);

    const res = await server.inject({
      method: "GET",
      url: "/api/sessions/aaa",
    });
    const body = JSON.parse(res.body);

    expect(body.activeSkills).toEqual(["coding-practices"]);
    expect(body.configuredSkills).toEqual(["coding-practices", "testing"]);
  });

  it("returns empty turns and skills for empty session", async () => {
    vi.mocked(readSessions).mockResolvedValue([SESSION_A]);
    vi.mocked(isProcessRunning).mockResolvedValue(false);
    vi.mocked(parseLogFile).mockResolvedValue([]);

    const res = await server.inject({
      method: "GET",
      url: "/api/sessions/aaa",
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.turns).toEqual([]);
    expect(body.activeSkills).toEqual([]);
  });

  it("returns 404 for unknown session", async () => {
    vi.mocked(readSessions).mockResolvedValue([]);

    const res = await server.inject({
      method: "GET",
      url: "/api/sessions/unknown",
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /api/sessions/:id", () => {
  it("updates customName and persists", async () => {
    vi.mocked(readSessions).mockResolvedValue([{ ...SESSION_A }]);
    vi.mocked(writeSessions).mockResolvedValue(undefined);

    const res = await server.inject({
      method: "PATCH",
      url: "/api/sessions/aaa",
      payload: { customName: "renamed" },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.customName).toBe("renamed");
    expect(vi.mocked(writeSessions)).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ customName: "renamed" }),
      ]),
    );
  });

  it("returns 404 for unknown session", async () => {
    vi.mocked(readSessions).mockResolvedValue([]);

    const res = await server.inject({
      method: "PATCH",
      url: "/api/sessions/unknown",
      payload: { customName: "x" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("coerces non-string customName to string", async () => {
    vi.mocked(readSessions).mockResolvedValue([{ ...SESSION_A }]);
    vi.mocked(writeSessions).mockResolvedValue(undefined);
    // Fastify's Ajv coerces number 123 to string "123", so this is accepted
    const res = await server.inject({
      method: "PATCH",
      url: "/api/sessions/aaa",
      payload: { customName: 123 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).customName).toBe("123");
  });
});

describe("POST /api/rename", () => {
  it("renames session by PID and persists", async () => {
    vi.mocked(readSessions).mockResolvedValue([
      { ...SESSION_A },
      { ...SESSION_B },
    ]);
    vi.mocked(writeSessions).mockResolvedValue(undefined);

    const res = await server.inject({
      method: "POST",
      url: "/api/rename",
      payload: { pid: 100, customName: "new name" },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.customName).toBe("new name");
    expect(vi.mocked(writeSessions)).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "aaa", customName: "new name" }),
      ]),
    );
    expect(vi.mocked(broadcast)).toHaveBeenCalledWith("aaa");
  });

  it("returns 404 when no session matches PID", async () => {
    vi.mocked(readSessions).mockResolvedValue([SESSION_A]);
    const res = await server.inject({
      method: "POST",
      url: "/api/rename",
      payload: { pid: 999, customName: "test" },
    });
    expect(res.statusCode).toBe(404);
  });

  test.each([
    ["pid missing", { customName: "test" }],
    ["customName missing", { pid: 100 }],
  ])("returns 400 when %s", async (_label, payload) => {
    const res = await server.inject({
      method: "POST",
      url: "/api/rename",
      payload,
    });
    expect(res.statusCode).toBe(400);
  });
});
