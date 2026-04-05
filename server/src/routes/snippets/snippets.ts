import type { FastifyInstance } from "fastify";
import type { Snippet } from "@weaver/shared/types";
import {
  readSnippets,
  writeSnippet,
  updateSnippet,
  deleteSnippet,
} from "../../services/snippets/index";

export function registerSnippetRoutes(server: FastifyInstance): void {
  server.get<{ Reply: { snippets: Snippet[] } }>("/api/snippets", async () => {
    const snippets = await readSnippets();
    return { snippets };
  });

  server.post<{
    Body: { trigger: string; expansion: string };
    Reply: { snippet: Snippet } | { error: string };
  }>("/api/snippets", async (request, reply) => {
    const { trigger, expansion } = request.body ?? ({} as any);
    if (!trigger || typeof trigger !== "string") {
      return reply.status(400).send({ error: "trigger is required" });
    }
    if (!expansion || typeof expansion !== "string") {
      return reply.status(400).send({ error: "expansion is required" });
    }
    const snippet = await writeSnippet({ trigger, expansion });
    return reply.status(201).send({ snippet });
  });

  server.put<{
    Params: { id: string };
    Body: { trigger: string; expansion: string };
    Reply: { snippet: Snippet } | { error: string };
  }>("/api/snippets/:id", async (request, reply) => {
    const { trigger, expansion } = request.body ?? ({} as any);
    if (!trigger || typeof trigger !== "string") {
      return reply.status(400).send({ error: "trigger is required" });
    }
    if (!expansion || typeof expansion !== "string") {
      return reply.status(400).send({ error: "expansion is required" });
    }
    const snippet = await updateSnippet(request.params.id, {
      trigger,
      expansion,
    });
    if (!snippet) {
      return reply.status(404).send({ error: "Snippet not found" });
    }
    return { snippet };
  });

  server.delete<{ Params: { id: string } }>(
    "/api/snippets/:id",
    async (request, reply) => {
      const deleted = await deleteSnippet(request.params.id);
      if (!deleted) {
        return reply.status(404).send({ error: "Snippet not found" });
      }
      return reply.status(204).send("");
    },
  );
}
