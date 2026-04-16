import { FastifyPluginAsync } from 'fastify';
import { SimulationEngine } from '../simulation/engine';

interface PluginOptions {
  engine: SimulationEngine;
}

export const alertsRoutes: FastifyPluginAsync<PluginOptions> = async (fastify, opts) => {
  const { engine } = opts;

  // GET /api/alerts?status=&severity=&serviceId=&search=&page=&pageSize=
  fastify.get<{
    Querystring: {
      status?: string;
      severity?: string;
      serviceId?: string;
      search?: string;
      page?: string;
      pageSize?: string;
    };
  }>('/alerts', async (req, reply) => {
    const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
    const pageSize = Math.min(5_000, Math.max(1, parseInt(req.query.pageSize ?? '25', 10)));

    const result = engine.getAlerts({
      status: req.query.status,
      severity: req.query.severity,
      serviceId: req.query.serviceId,
      search: req.query.search,
      page,
      pageSize,
    });

    return reply.send(result);
  });

  // PATCH /api/alerts/:id  { status: 'acknowledged' | 'resolved' }
  fastify.patch<{
    Params: { id: string };
    Body: { status: 'acknowledged' | 'resolved' };
  }>('/alerts/:id', async (req, reply) => {
    const { status } = req.body;
    if (status !== 'acknowledged' && status !== 'resolved') {
      return reply.status(400).send({ error: 'status must be "acknowledged" or "resolved"' });
    }

    const updated = engine.updateAlert(req.params.id, status);
    if (!updated) {
      return reply.status(404).send({ error: `Alert "${req.params.id}" not found` });
    }
    return reply.send(updated);
  });
};
