import type { FastifyInstance } from "fastify";
import type { SkillGraph, SkillDetail, ApiError } from "@weaver/shared/types";
import {
  buildSkillGraph,
  getSkillDetail,
} from "../../services/skill-graph/index";
import { readConfig } from "../../services/config/index";

export function registerSkillRoutes(server: FastifyInstance): void {
  server.get<{ Reply: SkillGraph }>("/api/skills", async () => {
    const { config } = await readConfig();
    return buildSkillGraph(config.skill_paths, config.skill_graph.categories);
  });

  server.get<{
    Params: { name: string };
    Querystring: { project?: string; source?: string };
    Reply: SkillDetail | ApiError;
  }>("/api/skills/:name", async (request, reply) => {
    const { config } = await readConfig();
    const { project, source } = request.query;
    const detail = await getSkillDetail(
      request.params.name,
      config.skill_paths,
      config.skill_graph.categories,
      project,
      source,
    );
    if (!detail) {
      return reply.status(404).send({ error: "Skill not found" });
    }
    return detail;
  });
}
