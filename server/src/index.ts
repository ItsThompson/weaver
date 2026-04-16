import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify, { FastifyError } from "fastify";
import fastifyStatic from "@fastify/static";
import { registerAdapter } from "@weaver/shared/adapter-registry";
import { kiroAdapter } from "@weaver/binding-kiro";
import { claudeCodeAdapter } from "@weaver/binding-claude-code";
import { registerHealthRoute } from "./routes/health";
import { registerSessionRoutes } from "./routes/sessions/index";
import { registerEventRoutes } from "./routes/events/index";
import { registerOrphanRoutes } from "./routes/orphans/index";
import { registerConfigRoutes } from "./routes/config";
import { registerSkillRoutes } from "./routes/skills/index";
import { registerDictationRoutes } from "./routes/dictation/index";
import { registerSnippetRoutes } from "./routes/snippets/index";
import { registerServicesRoute } from "./routes/services";
import {
  ensureDataDir,
  stopStaleSessionCleanup,
  startStaleSessionCleanup,
  startPidPolling,
} from "./services/storage/index";
import { broadcast } from "./services/event-bus";
import { startKeepAwake, stopKeepAwake } from "./services/keep-awake";
import { stopWebhookTimers } from "./services/webhook/index";
import { log } from "./utils/logger";
import { pruneAppLogs } from "@weaver/shared/logger";
import { serviceManager } from "./services/service-manager-instance";
import { readConfig } from "./services/config/index";

const __dirname = dirname(fileURLToPath(import.meta.url));

registerAdapter(kiroAdapter);
registerAdapter(claudeCodeAdapter);

const PORT = 8143;

const server = Fastify({
  ajv: { customOptions: { coerceTypes: false } },
});

server.setErrorHandler((error: FastifyError, _request, reply) => {
  const statusCode = error.statusCode ?? 500;
  log({
    timestamp: new Date().toISOString(),
    event: "server_error",
    error: error.message,
    statusCode,
  });
  reply.status(statusCode).send({ error: error.message, statusCode });
});

registerHealthRoute(server);
registerSessionRoutes(server);
registerEventRoutes(server);
registerOrphanRoutes(server);
registerConfigRoutes(server);
registerSkillRoutes(server);
registerDictationRoutes(server);
registerSnippetRoutes(server);
registerServicesRoute(server);

const clientDist =
  process.env.WEAVER_CLIENT_DIST || resolve(__dirname, "../../client/dist");
if (existsSync(clientDist)) {
  server.register(fastifyStatic, { root: clientDist, wildcard: false });
  server.setNotFoundHandler((_request, reply) => {
    reply.sendFile("index.html");
  });
}

async function start(): Promise<void> {
  await ensureDataDir();
  pruneAppLogs();
  startStaleSessionCleanup();
  startPidPolling((sessionId) => broadcast(sessionId));
  startKeepAwake(resolve(__dirname, "../../bin/keep-awake.sh"));
  await server.listen({ port: PORT, host: "0.0.0.0" });
  log({
    timestamp: new Date().toISOString(),
    event: "server_started",
    port: PORT,
  });

  const { config } = await readConfig();
  serviceManager.start(config);

  const shutdown = async () => {
    stopWebhookTimers();
    stopStaleSessionCleanup();
    stopKeepAwake();
    await serviceManager.stop();
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // When spawned by Electron with stdio: "pipe", stdin closes if the parent
  // dies unexpectedly (force-quit, crash). Treat that as a shutdown signal
  // so child processes (whisper, ollama) don't become orphans.
  if (process.stdin?.readable) {
    process.stdin.resume();
    process.stdin.on("end", shutdown);
  }
}

start().catch((err) => {
  log({
    timestamp: new Date().toISOString(),
    event: "server_start_failed",
    error: String(err),
  });
  process.exit(1);
});
