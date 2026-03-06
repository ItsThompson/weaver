import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify, { FastifyError } from 'fastify';
import fastifyStatic from '@fastify/static';
import { registerHealthRoute } from './routes/health';
import { registerSessionRoutes } from './routes/sessions/index';
import { registerEventRoutes } from './routes/events/index';
import { registerOrphanRoutes } from './routes/orphans/index';
import { registerConfigRoutes } from './routes/config';
import { stopStaleSessionCleanup, startStaleSessionCleanup, startPidPolling } from './services/storage/index';
import { broadcast } from './services/event-bus';
import { startKeepAwake, stopKeepAwake } from './services/keep-awake';
import { stopWebhookTimers } from './services/webhook/index';
import { log } from './utils/logger';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
registerConfigRoutes(server);

const clientDist = process.env.WEAVER_CLIENT_DIST || resolve(__dirname, '../../client/dist');
if (existsSync(clientDist)) {
  server.register(fastifyStatic, { root: clientDist, wildcard: false });
  server.setNotFoundHandler((_request, reply) => {
    reply.sendFile('index.html');
  });
}

async function start(): Promise<void> {
  startStaleSessionCleanup();
  startPidPolling((sessionId) => broadcast(sessionId));
  startKeepAwake();
  await server.listen({ port: PORT, host: '0.0.0.0' });
  log({ timestamp: new Date().toISOString(), event: 'server_started', port: PORT });

  const shutdown = async () => {
    stopWebhookTimers();
    stopStaleSessionCleanup();
    stopKeepAwake();
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  log({ timestamp: new Date().toISOString(), event: 'server_start_failed', error: String(err) });
  process.exit(1);
});
