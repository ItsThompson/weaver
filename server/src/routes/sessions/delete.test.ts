import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/services";

import { registerAdapter } from "@weaver/shared/adapter-registry";
import { kiroAdapter } from "@weaver/binding-kiro";
import { claudeCodeAdapter } from "@weaver/binding-claude-code";
import { SESSION_A } from "../../__tests__/fixtures/sessions";
import { readSessions, writeSessions } from "../../services/storage/index";
import { unlink } from "node:fs/promises";
import { broadcast } from "../../services/event-bus";
import Fastify from "fastify";
import { registerDeleteRoute } from "./delete";

registerAdapter(kiroAdapter);
registerAdapter(claudeCodeAdapter);

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  vi.clearAllMocks();
  server = Fastify();
  registerDeleteRoute(server);
  await server.ready();
});

afterEach(() => server.close());

describe("DELETE /api/sessions/:id", () => {
  it("removes session, log file, and calls adapter cleanup", async () => {
    vi.mocked(readSessions).mockResolvedValue([{ ...SESSION_A }]);
    vi.mocked(writeSessions).mockResolvedValue(undefined);
    const cleanupSpy = vi.spyOn(kiroAdapter, "cleanupSession");

    const res = await server.inject({
      method: "DELETE",
      url: "/api/sessions/aaa",
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(unlink)).toHaveBeenCalledWith(
      expect.stringContaining("aaa.jsonl"),
    );
    expect(cleanupSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: "aaa", pid: 100 }),
    );
    expect(vi.mocked(writeSessions)).toHaveBeenCalledWith([]);
    expect(vi.mocked(broadcast)).toHaveBeenCalledWith("aaa");
  });

  it("returns 404 for unknown session", async () => {
    vi.mocked(readSessions).mockResolvedValue([]);

    const res = await server.inject({
      method: "DELETE",
      url: "/api/sessions/unknown",
    });

    expect(res.statusCode).toBe(404);
  });

  it("continues when log file deletion fails", async () => {
    vi.mocked(readSessions).mockResolvedValue([{ ...SESSION_A }]);
    vi.mocked(writeSessions).mockResolvedValue(undefined);
    vi.mocked(unlink).mockRejectedValue(new Error("ENOENT"));

    const res = await server.inject({
      method: "DELETE",
      url: "/api/sessions/aaa",
    });

    expect(res.statusCode).toBe(200);
  });
});
