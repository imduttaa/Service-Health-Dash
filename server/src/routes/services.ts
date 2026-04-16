import { FastifyPluginAsync } from 'fastify';
import { SimulationEngine } from '../simulation/engine';

interface PluginOptions {
  engine: SimulationEngine;
}

export const servicesRoutes: FastifyPluginAsync<PluginOptions> = async (fastify, opts) => {
  const { engine } = opts;

  // GET /api/services
  fastify.get('/services', async (_req, reply) => {
    return reply.send(engine.getServices());
  });

  // GET /api/services/:id/metrics?from=&to=&resolution=
  fastify.get<{
    Params: { id: string };
    Querystring: { from?: string; to?: string; resolution?: string };
  }>('/services/:id/metrics', async (req, reply) => {
    const { id } = req.params;
    const service = engine.getService(id);

    if (!service) {
      return reply.status(404).send({ error: `Service "${id}" not found` });
    }

    const now = new Date();
    const to = req.query.to ? new Date(req.query.to) : now;
    // Default: last 15 minutes
    const from = req.query.from
      ? new Date(req.query.from)
      : new Date(now.getTime() - 15 * 60 * 1000);
    const resolution = req.query.resolution ?? 'raw';

    const metrics = engine.getMetrics(id, from, to, resolution);
    return reply.send(metrics);
  });
};
