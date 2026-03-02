import type { FastifyInstance } from 'fastify';
import { broadcast, emit, sseReply } from '../services/event-bus.js';
import { readSessions } from '../services/storage.js';

export function registerEventRoutes(server: FastifyInstance): void {
  server.post<{ Body: { sessionId: string } }>('/api/notify', async (request, reply) => {
    const { sessionId } = request.body ?? {};
    if (typeof sessionId !== 'string') {
      return reply.status(400).send({ error: 'sessionId required' });
    }
    broadcast(sessionId);
    return { ok: true };
  });

  server.post<{ Body: { pid: number } }>('/api/view', async (request, reply) => {
    const { pid } = request.body ?? {};
    if (typeof pid !== 'number') {
      return reply.status(400).send({ error: 'pid required' });
    }
    const sessions = await readSessions();
    const session = sessions.filter((s) => s.pid === pid).pop();
    if (!session) {
      return reply.status(404).send({ error: 'No session found for PID' });
    }
    emit({ event: 'navigate', data: { sessionId: session.id } });
    return { ok: true, sessionId: session.id };
  });

  server.post<{ Body: { page: string } }>('/api/navigate', async (request, reply) => {
    const { page } = request.body ?? {};
    if (typeof page !== 'string') {
      return reply.status(400).send({ error: 'page required' });
    }
    emit({ event: 'navigate', data: { page } });
    return { ok: true };
  });

  server.get('/api/events', async (_request, reply) => {
    sseReply(reply);
  });
}
