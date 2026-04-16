import type { FastifyInstance } from "fastify";
import type { ApiError } from "@weaver/shared/types";
import { Harness } from "@weaver/shared/types";
import { unlink } from "node:fs/promises";
import { sessionLogPath } from "@weaver/shared/paths";
import { getAdapter } from "@weaver/shared/adapter-registry";
import { readSessions, writeSessions } from "../../services/storage/index";
import { broadcast } from "../../services/event-bus";
import { log } from "../../utils/logger";

export function registerDeleteRoute(server: FastifyInstance): void {
  server.delete<{ Params: { id: string }; Reply: { ok: true } | ApiError }>(
    "/api/sessions/:id",
    async (request, reply) => {
      const { id } = request.params;
      const sessions = await readSessions();
      const index = sessions.findIndex((session) => session.id === id);
      if (index === -1) {
        return reply.status(404).send({ error: "Session not found" });
      }

      const session = sessions[index];

      // Remove log file
      try {
        await unlink(sessionLogPath(id));
      } catch (e) {
        log({
          timestamp: new Date().toISOString(),
          event: "session_delete_log_error",
          sessionId: id,
          error: String(e),
        });
      }

      // Harness-specific cleanup (kiro: delete marker file, claude-code: no-op)
      try {
        const adapter = getAdapter(session.harness ?? Harness.KIRO_CLI);
        await adapter.cleanupSession(session);
      } catch (e) {
        log({
          timestamp: new Date().toISOString(),
          event: "session_delete_cleanup_error",
          sessionId: id,
          error: String(e),
        });
      }

      // Remove from sessions index
      sessions.splice(index, 1);
      await writeSessions(sessions);
      broadcast(id);

      return { ok: true as const };
    },
  );
}
