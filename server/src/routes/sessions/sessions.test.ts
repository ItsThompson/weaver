import "../../__tests__/mocks/services";

import { SESSION_A, SESSION_B } from "../../__tests__/fixtures/sessions";
import {
  readSessions,
  writeSessions,
  isProcessRunning,
} from "../../services/storage/index";
import {
  parseLogFile,
  groupEventsByTurn,
  extractActiveSkillPaths,
} from "../../services/log-parser/index";
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
    vi.mocked(isProcessRunning).mockImplementation((pid) => pid === 100);

    const res = await server.inject({ method: "GET", url: "/api/sessions" });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe("aaa");
    expect(body[0].status).toBe("open");
    expect(body[1].id).toBe("bbb");
    expect(body[1].status).toBe("closed");
  });
});

describe("GET /api/sessions/:id", () => {
  it("returns session with turns", async () => {
    vi.mocked(readSessions).mockResolvedValue([SESSION_A]);
    vi.mocked(isProcessRunning).mockReturnValue(false);
    vi.mocked(parseLogFile).mockResolvedValue([]);
    vi.mocked(groupEventsByTurn).mockReturnValue([]);

    const res = await server.inject({
      method: "GET",
      url: "/api/sessions/aaa",
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.session.id).toBe("aaa");
    expect(body.session.status).toBe("closed");
    expect(body.turns).toEqual([]);
    expect(body.activeSkills).toEqual([]);
    expect(body.configuredSkills).toEqual([]);
  });

  it("includes activeSkills and configuredSkills in response", async () => {
    vi.mocked(readSessions).mockResolvedValue([SESSION_A]);
    vi.mocked(isProcessRunning).mockReturnValue(false);
    vi.mocked(parseLogFile).mockResolvedValue([]);
    vi.mocked(groupEventsByTurn).mockReturnValue([]);
    vi.mocked(extractActiveSkillPaths).mockReturnValue([
      "/home/.kiro/skills/coding-practices/SKILL.md",
    ]);
    vi.mocked(resolveConfiguredSkills).mockResolvedValue([
      "coding-practices",
      "testing",
    ]);

    const res = await server.inject({
      method: "GET",
      url: "/api/sessions/aaa",
    });
    const body = JSON.parse(res.body);

    expect(body.activeSkills).toEqual([
      "/home/.kiro/skills/coding-practices/SKILL.md",
    ]);
    expect(body.configuredSkills).toEqual(["coding-practices", "testing"]);
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

  it("returns 400 when customName is not a string", async () => {
    vi.mocked(readSessions).mockResolvedValue([SESSION_A]);
    const res = await server.inject({
      method: "PATCH",
      url: "/api/sessions/aaa",
      payload: { customName: 123 },
    });
    expect(res.statusCode).toBe(400);
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
