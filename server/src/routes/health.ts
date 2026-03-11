import type { FastifyInstance } from "fastify";

export function registerHealthRoute(server: FastifyInstance): void {
  server.get("/api/health", async () => {
    return { status: "ok" };
  });
}
