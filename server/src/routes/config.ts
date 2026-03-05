import type { FastifyInstance } from 'fastify';
import type { WeaverConfig, ApiError } from '@weaver/shared/types';
import { readConfig, parseAndValidateConfig, writeConfig } from '../services/config/index';

export function registerConfigRoutes(server: FastifyInstance): void {
  server.get<{ Reply: { config: WeaverConfig; warnings: string[] } }>('/api/config', async () => {
    return readConfig();
  });

  server.put<{ Body: WeaverConfig; Reply: { config: WeaverConfig } | ApiError }>('/api/config', async (request, reply) => {
    const raw = JSON.stringify(request.body);
    const { config, warnings } = parseAndValidateConfig(raw);

    if (warnings.length > 0) {
      return reply.status(422).send({ error: warnings.join('; ') });
    }

    await writeConfig(config);
    return { config };
  });
}
