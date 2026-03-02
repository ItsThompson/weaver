import type { FastifyInstance } from 'fastify';
import type { SessionWithStatus, TurnGroup } from '@shared/types.js';
import { readSessions, writeSessions, isProcessRunning } from '../services/storage.js';
import { parseLogFile, groupEventsByTurn, getLastEventName, deriveActivity } from '../services/log-parser.js';

export function registerSessionRoutes(server: FastifyInstance): void {
  server.get<{ Reply: SessionWithStatus[] }>('/api/sessions', async () => {
    const sessions = await readSessions();
    const results: SessionWithStatus[] = [];

    for (const s of sessions) {
      const isOpen = isProcessRunning(s.pid);
      const activity = isOpen ? deriveActivity(await getLastEventName(s.id) ?? 'agentSpawn') : undefined;
      results.push({ ...s, status: isOpen ? 'open' : 'closed', activity });
    }

    return results.sort((a, b) => b.startTime.localeCompare(a.startTime));
  });

  server.get<{ Params: { id: string }; Reply: { session: SessionWithStatus; turns: TurnGroup[] } }>(
    '/api/sessions/:id',
    async (request, reply) => {
      const { id } = request.params;
      const sessions = await readSessions();
      const session = sessions.find((s) => s.id === id);
      if (!session) return reply.status(404).send({ error: 'Session not found' } as any);

      const events = await parseLogFile(id);
      if (events.length === 0 && !session) return reply.status(404).send({ error: 'Log file not found' } as any);

      const isOpen = isProcessRunning(session.pid);
      const lastEvent = events.length > 0 ? events[events.length - 1].event.hook_event_name : 'agentSpawn';

      return {
        session: { ...session, status: isOpen ? 'open' : 'closed', activity: isOpen ? deriveActivity(lastEvent) : undefined } as SessionWithStatus,
        turns: groupEventsByTurn(events),
      };
    },
  );

  server.patch<{ Params: { id: string }; Body: { customName: string } }>(
    '/api/sessions/:id',
    async (request, reply) => {
      const { id } = request.params;
      const { customName } = request.body ?? {};

      if (typeof customName !== 'string') {
        return reply.status(400).send({ error: 'customName must be a string' } as any);
      }

      const sessions = await readSessions();
      const index = sessions.findIndex((s) => s.id === id);
      if (index === -1) return reply.status(404).send({ error: 'Session not found' } as any);

      sessions[index].customName = customName;
      await writeSessions(sessions);
      return sessions[index];
    },
  );
}
