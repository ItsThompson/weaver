import type { FastifyInstance } from "fastify";
import type { WeaverConfig, ApiError } from "@weaver/shared/types";
import {
  readConfig,
  parseAndValidateConfig,
  writeConfig,
} from "../services/config/index";
import { emit } from "../services/event-bus";
import { skillCache } from "../services/skill-graph/discover";

export function registerConfigRoutes(server: FastifyInstance): void {
  server.get<{
    Reply: {
      config: WeaverConfig;
      warnings: string[];
      fieldErrors: Record<string, Record<string, string>>;
    };
  }>("/api/config", async () => {
    return readConfig();
  });

  server.put<{
    Body: WeaverConfig;
    Reply: { config: WeaverConfig } | ApiError;
  }>("/api/config", async (request, reply) => {
    const raw = JSON.stringify(request.body);
    const { config, warnings, fieldErrors } = parseAndValidateConfig(raw);
    const hasFieldErrors = Object.keys(fieldErrors).length > 0;

    if (warnings.length > 0 || hasFieldErrors) {
      return reply.status(422).send({
        error: warnings.join("; ") || "Validation failed",
        fieldErrors,
      });
    }

    await writeConfig(config);
    skillCache.clear();
    emit({ event: "configChanged", data: { ...config } });
    return { config };
  });

  server.patch<{
    Body: Partial<WeaverConfig>;
    Reply: { config: WeaverConfig } | ApiError;
  }>("/api/config", async (request, reply) => {
    const { config: current } = await readConfig();
    const merged = { ...current, ...request.body };
    const raw = JSON.stringify(merged);
    const { config, warnings, fieldErrors } = parseAndValidateConfig(raw);
    const hasFieldErrors = Object.keys(fieldErrors).length > 0;

    if (warnings.length > 0 || hasFieldErrors) {
      return reply.status(422).send({
        error: warnings.join("; ") || "Validation failed",
        fieldErrors,
      });
    }

    await writeConfig(config);
    skillCache.clear();
    emit({ event: "configChanged", data: { ...config } });
    return { config };
  });
}
