import "../../__tests__/mocks/services";

import { SESSION_A } from "../../__tests__/fixtures/sessions";
import { readSessions } from "../../services/storage/index";
import {
  readOrphanEvents,
  groupByPid,
  assignOrphanEvents,
  deleteOrphanEvents,
  NotFoundError,
} from "../../services/orphan-storage/index";
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

const makeEvent = (pid: number) => ({
  timestamp: "2026-01-01T00:00:00Z",
  pid,
  event: { hook_event_name: "userPromptSubmit", cwd: "/tmp" },
});

describe("GET /api/orphans", () => {
  it("returns grouped orphan events", async () => {
    const events = [makeEvent(100), makeEvent(100), makeEvent(200)];
    vi.mocked(readOrphanEvents).mockResolvedValue(events as any);
    vi.mocked(groupByPid).mockReturnValue([
      { pid: 100, turns: [], eventCount: 2, timeRange: { start: "", end: "" } },
      { pid: 200, turns: [], eventCount: 1, timeRange: { start: "", end: "" } },
    ]);

    const res = await server.inject({ method: "GET", url: "/api/orphans" });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.groups).toHaveLength(2);
  });

  it("returns empty groups when no orphan events", async () => {
    vi.mocked(readOrphanEvents).mockResolvedValue([]);
    vi.mocked(groupByPid).mockReturnValue([]);

    const res = await server.inject({ method: "GET", url: "/api/orphans" });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.groups).toEqual([]);
  });
});

describe("POST /api/orphans/assign", () => {
  it("assigns events to target session", async () => {
    vi.mocked(readSessions).mockResolvedValue([{ ...SESSION_A }]);
    vi.mocked(assignOrphanEvents).mockResolvedValue({ movedCount: 1 });

    const res = await server.inject({
      method: "POST",
      url: "/api/orphans/assign",
      payload: { targetSessionId: "aaa", pid: 100 },
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(assignOrphanEvents)).toHaveBeenCalledWith("aaa", 100);
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

  it("returns 404 when service throws NotFoundError", async () => {
    vi.mocked(readSessions).mockResolvedValue([{ ...SESSION_A }]);
    vi.mocked(assignOrphanEvents).mockRejectedValue(
      new NotFoundError("No orphan events found for PID 100"),
    );

    const res = await server.inject({
      method: "POST",
      url: "/api/orphans/assign",
      payload: { targetSessionId: "aaa", pid: 100 },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /api/orphans/:pid", () => {
  it("deletes orphan events for PID", async () => {
    vi.mocked(deleteOrphanEvents).mockResolvedValue({ deletedCount: 2 });

    const res = await server.inject({
      method: "DELETE",
      url: "/api/orphans/100",
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(deleteOrphanEvents)).toHaveBeenCalledWith(100);
  });

  it("returns 404 when no events for PID", async () => {
    vi.mocked(deleteOrphanEvents).mockRejectedValue(
      new NotFoundError("No orphan events found for PID 999"),
    );

    const res = await server.inject({
      method: "DELETE",
      url: "/api/orphans/999",
    });

    expect(res.statusCode).toBe(404);
  });
});
