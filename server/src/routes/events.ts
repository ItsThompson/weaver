import type { FastifyInstance } from 'fastify';
import { broadcast, sseReply } from '../services/event-bus.js';

export function registerEventRoutes(server: FastifyInstance): void {
  // Hook script POSTs here to notify of session updates
  server.post<{ Body: { sessionId: string } }>('/api/notify', async (request, reply) => {
    const { sessionId } = request.body ?? {};
    if (typeof sessionId !== 'string') {
      return reply.status(400).send({ error: 'sessionId required' });
    }
    broadcast(sessionId);
    return { ok: true };
  });

  // Client connects here for real-time updates
  server.get('/api/events', async (_request, reply) => {
    sseReply(reply);
    // Keep connection open — Fastify won't auto-close since we wrote to reply.raw
  });
}
