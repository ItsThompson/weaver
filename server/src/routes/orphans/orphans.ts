import type { FastifyInstance } from "fastify";
import type { OrphanGroup, ApiError } from "@weaver/shared/types";
import { readSessions, writeSessions } from "../../services/storage/index";
import {
  readOrphanEvents,
  groupByPid,
  assignOrphanEvents,
  deleteOrphanEvents,
  NotFoundError,
} from "../../services/orphan-storage/index";

export function registerOrphanRoutes(server: FastifyInstance): void {
  server.get<{ Reply: { groups: OrphanGroup[] } }>("/api/orphans", async () => {
    const events = await readOrphanEvents();
    return { groups: groupByPid(events) };
  });

  server.get<{ Reply: { count: number } }>("/api/orphans/count", async () => {
    const events = await readOrphanEvents();
    return { count: events.length };
  });

  server.post<{
    Body: { targetSessionId: string; pid: number };
    Reply: { ok: true } | ApiError;
  }>("/api/orphans/assign", async (request, reply) => {
    const { targetSessionId, pid } = request.body ?? {};
    if (!targetSessionId || typeof pid !== "number") {
      return reply
        .status(400)
        .send({ error: "targetSessionId and pid are required" });
    }

    const sessions = await readSessions();
    const targetSession = sessions.find((s) => s.id === targetSessionId);
    if (!targetSession) {
      return reply.status(404).send({ error: "Target session not found" });
    }

    try {
      await assignOrphanEvents(targetSessionId, pid);
    } catch (e) {
      if (e instanceof NotFoundError) {
        return reply.status(404).send({ error: e.message });
      }
      throw e;
    }

    // Update the session's PID to the orphan group's PID since it's the current process
    if (pid !== 0 && targetSession.pid !== pid) {
      const allSessions = await readSessions();
      const idx = allSessions.findIndex((s) => s.id === targetSessionId);
      if (idx !== -1) {
        allSessions[idx].pid = pid;
        await writeSessions(allSessions);
      }
    }

    return { ok: true };
  });

  server.delete<{ Params: { pid: string }; Reply: { ok: true } | ApiError }>(
    "/api/orphans/:pid",
    async (request, reply) => {
      const pid = Number(request.params.pid);
      if (!Number.isFinite(pid)) {
        return reply.status(400).send({ error: "Invalid PID" });
      }

      try {
        await deleteOrphanEvents(pid);
      } catch (e) {
        if (e instanceof NotFoundError) {
          return reply.status(404).send({ error: e.message });
        }
        throw e;
      }

      return { ok: true };
    },
  );
}
