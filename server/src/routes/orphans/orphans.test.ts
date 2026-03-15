import { SESSION_A } from "../../__tests__/fixtures/sessions";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn<() => Promise<string>>(),
  writeFile: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  appendFile: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  mkdir: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  readdir: vi.fn<() => Promise<string[]>>(),
  unlink: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn<() => boolean>(),
}));

vi.mock("../../services/storage/index", () => ({
  readSessions: vi.fn(),
  writeSessions: vi.fn(),
  isProcessRunning: vi.fn(),
  ensureDataDir: vi.fn(),
  appendSession: vi.fn(),
  startStaleSessionCleanup: vi.fn(),
  stopStaleSessionCleanup: vi.fn(),
  cleanStaleSessions: vi.fn(),
}));

vi.mock("../../services/log-parser/index", () => ({
  parseLogFile: vi.fn(),
  groupEventsByTurn: vi.fn(),
  getLastEvent: vi
    .fn()
    .mockResolvedValue({ name: "stop", timestamp: new Date().toISOString() }),
  deriveActivity: vi.fn().mockReturnValue("idle"),
}));

vi.mock("../../services/event-bus", () => ({
  broadcast: vi.fn(),
  emit: vi.fn(),
  sseReply: vi.fn(),
}));

vi.mock("../../services/webhook/index", () => ({
  handleWebhookEvent: vi.fn(),
  isWebhookEnabled: vi.fn().mockReturnValue(false),
  setWebhookEnabled: vi.fn(),
  stopWebhookTimers: vi.fn(),
}));

vi.mock("../../utils/logger", () => ({
  log: vi.fn(),
}));

import { readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readSessions, writeSessions } from "../../services/storage/index";
import Fastify from "fastify";
import { registerOrphanRoutes } from "./orphans";

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  vi.clearAllMocks();
  server = Fastify();
  registerOrphanRoutes(server);
  await server.ready();
});

afterEach(() => server.close());

const orphanLine = (pid: number, eventName = "userPromptSubmit") =>
  JSON.stringify({
    timestamp: "2026-01-01T00:00:00Z",
    pid,
    event: { hook_event_name: eventName, cwd: "/tmp" },
  });

describe("GET /api/orphans", () => {
  it("returns grouped orphan events", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(
      `${orphanLine(100)}\n${orphanLine(100)}\n${orphanLine(200)}\n`,
    );

    const res = await server.inject({ method: "GET", url: "/api/orphans" });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.groups).toHaveLength(2);
    expect(body.groups.find((g: any) => g.pid === 100).eventCount).toBe(2);
    expect(body.groups.find((g: any) => g.pid === 200).eventCount).toBe(1);
  });

  it("returns empty groups when no orphan file", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const res = await server.inject({ method: "GET", url: "/api/orphans" });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.groups).toEqual([]);
  });
});

describe("POST /api/orphans/assign", () => {
  it("moves events to target session log", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(
      `${orphanLine(100)}\n${orphanLine(200)}\n`,
    );
    vi.mocked(readSessions).mockResolvedValue([{ ...SESSION_A }]);

    const res = await server.inject({
      method: "POST",
      url: "/api/orphans/assign",
      payload: { targetSessionId: "aaa", pid: 100 },
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(appendFile)).toHaveBeenCalledWith(
      expect.stringContaining("aaa.jsonl"),
      expect.any(String),
    );
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      expect.stringContaining("orphan.jsonl"),
      expect.stringContaining('"pid":200'),
    );
  });

  it("returns 404 when target session missing", async () => {
    vi.mocked(readSessions).mockResolvedValue([]);

    const res = await server.inject({
      method: "POST",
      url: "/api/orphans/assign",
      payload: { targetSessionId: "missing", pid: 100 },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /api/orphans/:pid", () => {
  it("removes orphan events for PID", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(
      `${orphanLine(100)}\n${orphanLine(200)}\n`,
    );

    const res = await server.inject({
      method: "DELETE",
      url: "/api/orphans/100",
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      expect.stringContaining("orphan.jsonl"),
      expect.stringContaining('"pid":200'),
    );
  });

  it("returns 404 when no events for PID", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(`${orphanLine(200)}\n`);

    const res = await server.inject({
      method: "DELETE",
      url: "/api/orphans/999",
    });

    expect(res.statusCode).toBe(404);
  });
});
