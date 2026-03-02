import Fastify, { FastifyError } from 'fastify';
import { registerHealthRoute } from './routes/health.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerEventRoutes } from './routes/events.js';
import { registerOrphanRoutes } from './routes/orphans.js';
import { ensureDataDir, startStaleSessionCleanup, startPidPolling } from './services/storage.js';
import { broadcast } from './services/event-bus.js';
import { startKeepAwake } from './services/keep-awake.js';
import { log } from './utils/logger.js';

const PORT = 8143;

const server = Fastify();

server.setErrorHandler((error: FastifyError, _request, reply) => {
  const statusCode = error.statusCode ?? 500;
  log({ timestamp: new Date().toISOString(), event: 'server_error', error: error.message, statusCode });
  reply.status(statusCode).send({ error: error.message, statusCode });
});

registerHealthRoute(server);
registerSessionRoutes(server);
registerEventRoutes(server);
registerOrphanRoutes(server);

async function start(): Promise<void> {
  await ensureDataDir();
  startStaleSessionCleanup();
  startPidPolling((sessionId) => broadcast(sessionId));
  startKeepAwake();
  await server.listen({ port: PORT, host: '0.0.0.0' });
  log({ timestamp: new Date().toISOString(), event: 'server_started', port: PORT });
}

start().catch((err) => {
  log({ timestamp: new Date().toISOString(), event: 'server_start_failed', error: String(err) });
  process.exit(1);
});
