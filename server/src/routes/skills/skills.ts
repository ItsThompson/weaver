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
    return buildSkillGraph(process.cwd(), config.skill_graph.categories);
  });

  server.get<{ Params: { name: string }; Reply: SkillDetail | ApiError }>(
    "/api/skills/:name",
    async (request, reply) => {
      const { config } = await readConfig();
      const detail = await getSkillDetail(
        request.params.name,
        process.cwd(),
        config.skill_graph.categories,
      );
      if (!detail) {
        return reply.status(404).send({ error: "Skill not found" });
      }
      return detail;
    },
  );
}
