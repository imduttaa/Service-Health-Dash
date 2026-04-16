import { FastifyPluginAsync } from 'fastify';
import { SimulationEngine } from '../simulation/engine';

interface PluginOptions {
  engine: SimulationEngine;
}

export const dashboardRoutes: FastifyPluginAsync<PluginOptions> = async (fastify, opts) => {
  fastify.get('/dashboard/summary', async (_req, reply) => {
    return reply.send(opts.engine.getSummary());
  });
};
