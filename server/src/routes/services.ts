import type { FastifyInstance } from "fastify";
import type { ServicesStatusResponse } from "@weaver/shared/types";
import { serviceManager } from "../services/service-manager-instance";

export function registerServicesRoute(server: FastifyInstance): void {
  server.get<{ Reply: ServicesStatusResponse }>(
    "/api/services/status",
    async () => {
      return serviceManager.getStatus();
    },
  );
}
