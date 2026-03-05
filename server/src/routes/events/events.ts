import type { FastifyInstance } from 'fastify';
import { broadcast, emit, sseReply } from '../../services/event-bus';
import { readSessions } from '../../services/storage/index';
import { handleWebhookEvent } from '../../services/webhook/index';

export function registerEventRoutes(server: FastifyInstance): void {
  server.post<{ Body: { sessionId: string; eventName?: string } }>('/api/notify', async (request, reply) => {
    const { sessionId, eventName } = request.body ?? {};
    if (typeof sessionId !== 'string') {
      return reply.status(400).send({ error: 'sessionId required' });
    }

    // Enrich with session name for notifications
    const sessions = await readSessions();
    const session = sessions.find((s) => s.id === sessionId);
    const sessionName = session?.customName || session?.cwd.split('/').pop() || sessionId.slice(0, 8);

    broadcast(sessionId, eventName, sessionName);
    handleWebhookEvent(sessionId, eventName, sessionName, session);
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
