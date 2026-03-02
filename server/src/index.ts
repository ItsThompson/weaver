import Fastify from 'fastify';
import { registerHealthRoute } from './routes/health.js';
import { ensureDataDir, startStaleSessionCleanup } from './services/storage.js';
import { log } from './utils/logger.js';

const PORT = 8143;

const server = Fastify();

server.setErrorHandler((error, _request, reply) => {
  const statusCode = error.statusCode ?? 500;
  log({ timestamp: new Date().toISOString(), event: 'server_error', error: error.message, statusCode });
  reply.status(statusCode).send({ error: error.message, statusCode });
});

registerHealthRoute(server);

async function start(): Promise<void> {
  await ensureDataDir();
  startStaleSessionCleanup();
  await server.listen({ port: PORT, host: '0.0.0.0' });
  log({ timestamp: new Date().toISOString(), event: 'server_started', port: PORT });
}

start().catch((err) => {
  log({ timestamp: new Date().toISOString(), event: 'server_start_failed', error: String(err) });
  process.exit(1);
});
