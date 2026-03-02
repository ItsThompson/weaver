import type { FastifyReply } from 'fastify';

type Listener = (sessionId: string) => void;

const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function broadcast(sessionId: string): void {
  for (const listener of listeners) {
    listener(sessionId);
  }
}

export function sseReply(reply: FastifyReply): () => void {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const unsubscribe = subscribe((sessionId) => {
    reply.raw.write(`data: ${JSON.stringify({ sessionId })}\n\n`);
  });

  reply.raw.on('close', unsubscribe);
  return unsubscribe;
}
