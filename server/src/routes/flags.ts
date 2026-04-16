import { FastifyPluginAsync } from 'fastify';
import { defaultFlags, persistFlags } from '../data/flags';
import { FeatureFlags, FeatureFlagKey } from '@healthdash/shared';

/** In-memory copy, initialised from flags.json + env overrides at startup. */
let runtimeFlags: FeatureFlags = { ...defaultFlags };

export const flagsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/flags — return all flags
  fastify.get('/flags', async (_req, reply) => {
    return reply.send(runtimeFlags);
  });

  // PATCH /api/flags — override one or more flags at runtime and persist to flags.json
  fastify.patch<{ Body: Partial<FeatureFlags> }>('/flags', async (req, reply) => {
    runtimeFlags = { ...runtimeFlags, ...req.body };
    persistFlags(runtimeFlags);   // write back so changes survive a restart
    return reply.send(runtimeFlags);
  });

  // GET /api/flags/:key — single flag value
  fastify.get<{ Params: { key: string } }>('/flags/:key', async (req, reply) => {
    const key = req.params.key as FeatureFlagKey;
    if (!(key in runtimeFlags)) {
      return reply.status(404).send({ error: `Flag "${key}" not found` });
    }
    return reply.send({ key, enabled: runtimeFlags[key] });
  });
};
