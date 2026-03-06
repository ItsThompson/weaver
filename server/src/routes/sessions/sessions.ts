import type { FastifyInstance } from 'fastify';
import type { Session, SessionWithStatus, TurnGroup, ActivityStatus, ApiError } from '@weaver/shared/types';
import { readSessions, isProcessRunning, getDb } from '../../services/storage/index';
import { buildTurnsFromSqlite, getLastEvent, deriveActivity } from '../../services/log-parser/index';
import { broadcast } from '../../services/event-bus';
import { isWebhookEnabled, setWebhookEnabled } from '../../services/webhook/index';

function toSessionWithStatus(session: Session, isOpen: boolean, activity?: ActivityStatus): SessionWithStatus {
  return { ...session, status: isOpen ? 'open' : 'closed', activity };
}

export function registerSessionRoutes(server: FastifyInstance): void {
  server.get<{ Reply: SessionWithStatus[] }>('/api/sessions', async () => {
    const sessions = await readSessions();
    const results: SessionWithStatus[] = [];

    for (const s of sessions) {
      const isOpen = isProcessRunning(s.pid);
      let activity: SessionWithStatus['activity'];
      if (isOpen) {
        const last = await getLastEvent(s.id);
        activity = deriveActivity(last?.name ?? 'agentSpawn', last?.timestamp);
      }
      results.push(toSessionWithStatus(s, isOpen, activity));
    }

    return results.sort((a, b) => b.startTime.localeCompare(a.startTime));
  });

  server.get<{ Params: { id: string }; Reply: { session: SessionWithStatus; turns: TurnGroup[] } | ApiError }>(
    '/api/sessions/:id',
    async (request, reply) => {
      const { id } = request.params;
      const db = getDb();
      const sessionRow = db.getSession(id);
      if (!sessionRow) return reply.status(404).send({ error: 'Session not found' });

      const sessions = await readSessions();
      const session = sessions.find((s) => s.id === id)!;

      const isOpen = isProcessRunning(session.pid);
      const lastEvent = await getLastEvent(id);
      const activity = isOpen ? deriveActivity(lastEvent?.name ?? 'agentSpawn', lastEvent?.timestamp) : undefined;

      const messages = db.getMessages(id);
      const toolCalls = db.getToolCalls(id);
      const turns = buildTurnsFromSqlite(messages, toolCalls);

      return {
        session: toSessionWithStatus(session, isOpen, activity),
        turns,
        webhookEnabled: isWebhookEnabled(id),
      };
    },
  );

  server.patch<{ Params: { id: string }; Body: { customName: string }; Reply: Session | ApiError }>(
    '/api/sessions/:id',
    async (request, reply) => {
      const { id } = request.params;
      const { customName } = request.body ?? {};

      if (typeof customName !== 'string') {
        return reply.status(400).send({ error: 'customName must be a string' });
      }

      const db = getDb();
      const sessionRow = db.getSession(id);
      if (!sessionRow) return reply.status(404).send({ error: 'Session not found' });

      db.updateSession(id, { custom_name: customName });

      const sessions = await readSessions();
      return sessions.find((s) => s.id === id)!;
    },
  );

  server.post<{ Body: { pid: number; customName: string }; Reply: Session | ApiError }>(
    '/api/rename',
    async (request, reply) => {
      const { pid, customName } = request.body ?? {};

      if (typeof pid !== 'number') return reply.status(400).send({ error: 'pid required' });
      if (typeof customName !== 'string') return reply.status(400).send({ error: 'customName required' });

      const sessions = await readSessions();
      let session: Session | undefined;
      for (let i = sessions.length - 1; i >= 0; i--) {
        if (sessions[i].pid === pid) { session = sessions[i]; break; }
      }
      if (!session) return reply.status(404).send({ error: 'No session found for PID' });

      getDb().updateSession(session.id, { custom_name: customName });
      broadcast(session.id);

      const updated = await readSessions();
      return updated.find((s) => s.id === session!.id)!;
    },
  );

  server.post<{ Params: { id: string }; Body: { enabled: boolean }; Reply: { ok: true; enabled: boolean } | ApiError }>(
    '/api/sessions/:id/webhook',
    async (request, reply) => {
      const { id } = request.params;
      const { enabled } = request.body ?? {};
      if (typeof enabled !== 'boolean') return reply.status(400).send({ error: 'enabled must be a boolean' });

      const db = getDb();
      if (!db.getSession(id)) return reply.status(404).send({ error: 'Session not found' });

      setWebhookEnabled(id, enabled);
      return { ok: true as const, enabled };
    },
  );

  server.delete<{ Params: { id: string }; Reply: { ok: true } | ApiError }>(
    '/api/sessions/:id',
    async (request, reply) => {
      const { id } = request.params;
      const db = getDb();
      if (!db.getSession(id)) return reply.status(404).send({ error: 'Session not found' });

      db.deleteSession(id);
      broadcast(id);

      return { ok: true as const };
    },
  );
}
