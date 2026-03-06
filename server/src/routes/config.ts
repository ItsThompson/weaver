import type { FastifyInstance } from 'fastify';
import type { WeaverConfig, ApiError } from '@weaver/shared/types';
import { readConfig, parseAndValidateConfig, writeConfig } from '../services/config/index';
import { emit } from '../services/event-bus';

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
    emit({ event: 'configChanged', data: { ...config } });
    return { config };
  });

  server.patch<{ Body: Partial<WeaverConfig>; Reply: { config: WeaverConfig } | ApiError }>(
    '/api/config',
    async (request, reply) => {
      const { config: current } = await readConfig();
      const merged = { ...current, ...request.body };
      const raw = JSON.stringify(merged);
      const { config, warnings } = parseAndValidateConfig(raw);

      if (warnings.length > 0) {
        return reply.status(422).send({ error: warnings.join('; ') });
      }

      await writeConfig(config);
      emit({ event: 'configChanged', data: { ...config } });
      return { config };
    },
  );
}
