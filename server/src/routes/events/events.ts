import type { FastifyInstance } from "fastify";
import { WeaverEventName } from "@weaver/shared/types";
import { broadcast, emit, sseReply } from "../../services/event-bus";
import { readSessions } from "../../services/storage/index";
import { handleWebhookEvent } from "../../services/webhook/index";
import { log } from "../../utils/logger";
import { notifyBody, viewBody, navigateBody } from "../schemas";
import { zodBody } from "../schema-utils";

export function registerEventRoutes(server: FastifyInstance): void {
  server.post<{ Body: { sessionId: string; eventName?: WeaverEventName } }>(
    "/api/notify",
    { schema: zodBody(notifyBody) },
    async (request, reply) => {
      const { sessionId, eventName } = request.body;

      // Enrich with session name for notifications
      const sessions = await readSessions();
      const session = sessions.find((s) => s.id === sessionId);
      const sessionName =
        session?.customName ||
        session?.cwd.split("/").pop() ||
        sessionId.slice(0, 8);

      broadcast(sessionId, eventName, sessionName);
      // Fire-and-forget: webhook delivery should not block the response
      handleWebhookEvent(sessionId, eventName, sessionName, session).catch(
        (err) =>
          log({
            timestamp: new Date().toISOString(),
            event: "webhook_fire_and_forget_error",
            error: String(err),
          }),
      );
      return { ok: true };
    },
  );

  server.post<{ Body: { pid: number } }>(
    "/api/view",
    { schema: zodBody(viewBody) },
    async (request, reply) => {
      const { pid } = request.body;
      const sessions = await readSessions();
      const session = sessions.filter((s) => s.pid === pid).pop();
      if (!session) {
        return reply.status(404).send({ error: "No session found for PID" });
      }
      emit({ event: "navigate", data: { sessionId: session.id } });
      return { ok: true, sessionId: session.id };
    },
  );

  server.post<{ Body: { page: string } }>(
    "/api/navigate",
    { schema: zodBody(navigateBody) },
    async (request, reply) => {
      const { page } = request.body;
      emit({ event: "navigate", data: { page } });
      return { ok: true };
    },
  );

  server.get("/api/events", async (_request, reply) => {
    sseReply(reply);
  });
}
