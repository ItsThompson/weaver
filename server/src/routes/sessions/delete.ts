import type { FastifyInstance } from "fastify";
import type { ApiError } from "@weaver/shared/types";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
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
      const dataDir = join(homedir(), ".weaver");

      // Remove log file
      try {
        await unlink(join(dataDir, "logs", `${id}.jsonl`));
      } catch (e) {
        log({
          timestamp: new Date().toISOString(),
          event: "session_delete_log_error",
          sessionId: id,
          error: String(e),
        });
      }

      // Remove session marker if present
      try {
        await unlink(join(dataDir, `.current-session-${session.pid}`));
      } catch (e) {
        log({
          timestamp: new Date().toISOString(),
          event: "session_delete_marker_error",
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
