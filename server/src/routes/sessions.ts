import type { FastifyInstance } from 'fastify';
import type { Session, SessionWithStatus, TurnGroup, ActivityStatus, ApiError } from '@weaver/shared/types';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readSessions, writeSessions, isProcessRunning } from '../services/storage.js';
import { parseLogFile, groupEventsByTurn, getLastEvent, deriveActivity } from '../services/log-parser.js';
import { broadcast } from '../services/event-bus.js';

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
      const sessions = await readSessions();
      const session = sessions.find((s) => s.id === id);
      if (!session) return reply.status(404).send({ error: 'Session not found' });

      const events = await parseLogFile(id);
      if (events.length === 0 && !session) return reply.status(404).send({ error: 'Log file not found' });

      const isOpen = isProcessRunning(session.pid);
      const lastEvent = events.length > 0 ? events[events.length - 1] : null;
      const activity = isOpen ? deriveActivity(lastEvent?.event.hook_event_name ?? 'agentSpawn', lastEvent?.timestamp) : undefined;

      return {
        session: toSessionWithStatus(session, isOpen, activity),
        turns: groupEventsByTurn(events),
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

      const sessions = await readSessions();
      const index = sessions.findIndex((s) => s.id === id);
      if (index === -1) return reply.status(404).send({ error: 'Session not found' });

      sessions[index].customName = customName;
      await writeSessions(sessions);
      return sessions[index];
    },
  );

  server.post<{ Body: { pid: number; customName: string }; Reply: Session | ApiError }>(
    '/api/rename',
    async (request, reply) => {
      const { pid, customName } = request.body ?? {};

      if (typeof pid !== 'number') return reply.status(400).send({ error: 'pid required' });
      if (typeof customName !== 'string') return reply.status(400).send({ error: 'customName required' });

      const sessions = await readSessions();
      let index = -1;
      for (let i = sessions.length - 1; i >= 0; i--) {
        if (sessions[i].pid === pid) { index = i; break; }
      }
      if (index === -1) return reply.status(404).send({ error: 'No session found for PID' });

      sessions[index].customName = customName;
      await writeSessions(sessions);
      broadcast(sessions[index].id);
      return sessions[index];
    },
  );

  server.delete<{ Params: { id: string }; Reply: { ok: true } | ApiError }>(
    '/api/sessions/:id',
    async (request, reply) => {
      const { id } = request.params;
      const sessions = await readSessions();
      const index = sessions.findIndex((s) => s.id === id);
      if (index === -1) return reply.status(404).send({ error: 'Session not found' });

      const session = sessions[index];
      const dataDir = join(homedir(), '.weaver');

      // Remove log file
      try { await unlink(join(dataDir, 'logs', `${id}.jsonl`)); } catch { /* may not exist */ }

      // Remove session marker if present
      try { await unlink(join(dataDir, `.current-session-${session.pid}`)); } catch { /* may not exist */ }

      // Remove from sessions index
      sessions.splice(index, 1);
      await writeSessions(sessions);
      broadcast(id);

      return { ok: true as const };
    },
  );
}
