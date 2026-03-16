import type { FastifyInstance } from "fastify";
import type { SkillGraph, SkillDetail, ApiError } from "@weaver/shared/types";
import {
  buildSkillGraph,
  getSkillDetail,
} from "../../services/skill-graph/index";

export function registerSkillRoutes(server: FastifyInstance): void {
  server.get<{ Reply: SkillGraph }>("/api/skills", async () => {
    return buildSkillGraph();
  });

  server.get<{
    Params: { name: string };
    Querystring: { project?: string; source?: string };
    Reply: SkillDetail | ApiError;
  }>("/api/skills/:name", async (request, reply) => {
    const { project, source } = request.query;
    const options = project || source ? { project, source } : undefined;
    const detail = await getSkillDetail(request.params.name, options);
    if (!detail) {
      return reply.status(404).send({ error: "Skill not found" });
    }
    return detail;
  });
}
