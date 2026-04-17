import type { FastifyInstance } from "fastify";
import type {
  Session,
  SessionWithStatus,
  TurnGroup,
  ApiError,
} from "@weaver/shared/types";
import { WeaverEventName } from "@weaver/shared/types";
import {
  readSessions,
  writeSessions,
  isProcessRunning,
} from "../../services/storage/index";
import {
  parseLogFile,
  groupEventsByTurn,
  getLastEvent,
  deriveActivity,
} from "../../services/log-parser/index";
import { broadcast } from "../../services/event-bus";
import {
  isWebhookEnabled,
  setWebhookEnabled,
} from "../../services/webhook/index";
import {
  toSessionWithStatus,
  safeActiveSkills,
  safeConfiguredSkills,
} from "./helpers";
import { registerDeleteRoute } from "./delete";
import { getProcessName } from "../../utils/get-process-name";
import { patchSessionBody, renameBody, webhookToggleBody } from "../schemas";
import { zodBody } from "../schema-utils";

export function registerSessionRoutes(server: FastifyInstance): void {
  server.get<{ Reply: SessionWithStatus[] }>("/api/sessions", async () => {
    const sessions = await readSessions();
    const results = await Promise.all(
      sessions.map(async (s) => {
        const processName = getProcessName(s);
        const isOpen = processName
          ? await isProcessRunning(s.pid, processName)
          : false;
        let activity: SessionWithStatus["activity"];
        if (isOpen) {
          const last = await getLastEvent(s.id);
          activity = deriveActivity(
            last?.name ?? WeaverEventName.AGENT_SPAWN,
            last?.timestamp,
          );
        }
        return toSessionWithStatus(s, isOpen, activity);
      }),
    );

    return results.sort((a, b) => b.startTime.localeCompare(a.startTime));
  });

  server.get<{
    Params: { id: string };
    Reply: { session: SessionWithStatus; turns: TurnGroup[] } | ApiError;
  }>("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params;
    const sessions = await readSessions();
    const session = sessions.find((s) => s.id === id);
    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }

    const events = await parseLogFile(id);
    if (events.length === 0 && !session) {
      return reply.status(404).send({ error: "Log file not found" });
    }

    const sessionProcessName = getProcessName(session);
    const isOpen = sessionProcessName
      ? await isProcessRunning(session.pid, sessionProcessName)
      : false;
    const lastEvent = events.length > 0 ? events[events.length - 1] : null;
    const activity = isOpen
      ? deriveActivity(
          lastEvent?.eventName ?? WeaverEventName.AGENT_SPAWN,
          lastEvent?.timestamp,
        )
      : undefined;

    return {
      session: toSessionWithStatus(session, isOpen, activity),
      turns: groupEventsByTurn(events),
      webhookEnabled: isWebhookEnabled(id),
      activeSkills: safeActiveSkills(events),
      configuredSkills: await safeConfiguredSkills(session),
    };
  });

  server.patch<{
    Params: { id: string };
    Body: { customName: string };
    Reply: Session | ApiError;
  }>(
    "/api/sessions/:id",
    { schema: zodBody(patchSessionBody) },
    async (request, reply) => {
      const { id } = request.params;
      const { customName } = request.body;

      const sessions = await readSessions();
      const index = sessions.findIndex((s) => s.id === id);
      if (index === -1) {
        return reply.status(404).send({ error: "Session not found" });
      }

      sessions[index].customName = customName;
      await writeSessions(sessions);
      return sessions[index];
    },
  );

  server.post<{
    Body: { pid: number; customName: string };
    Reply: Session | ApiError;
  }>("/api/rename", { schema: zodBody(renameBody) }, async (request, reply) => {
    const { pid, customName } = request.body;

    const sessions = await readSessions();
    const index = sessions.findLastIndex((s) => s.pid === pid);
    if (index === -1) {
      return reply.status(404).send({ error: "No session found for PID" });
    }

    sessions[index].customName = customName;
    await writeSessions(sessions);
    broadcast(sessions[index].id);
    return sessions[index];
  });

  server.post<{
    Params: { id: string };
    Body: { enabled: boolean };
    Reply: { ok: true; enabled: boolean } | ApiError;
  }>(
    "/api/sessions/:id/webhook",
    { schema: zodBody(webhookToggleBody) },
    async (request, reply) => {
      const { id } = request.params;
      const { enabled } = request.body;

      const sessions = await readSessions();
      if (!sessions.some((s) => s.id === id)) {
        return reply.status(404).send({ error: "Session not found" });
      }

      setWebhookEnabled(id, enabled);
      return { ok: true as const, enabled };
    },
  );

  registerDeleteRoute(server);
}
