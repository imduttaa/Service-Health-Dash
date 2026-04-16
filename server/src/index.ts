import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { servicesRoutes } from './routes/services';
import { alertsRoutes } from './routes/alerts';
import { dashboardRoutes } from './routes/dashboard';
import { flagsRoutes } from './routes/flags';
import { WebSocketBroadcaster } from './stream/broadcaster';
import { SimulationEngine } from './simulation/engine';
import { seedServices } from './data/seed';

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

async function bootstrap() {
  const app = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
      },
    },
  });

  // ── Plugins ──────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  });
  await app.register(fastifyWebsocket);

  // ── Domain bootstrap ─────────────────────────────────────────────────────
  const services = seedServices();
  const broadcaster = new WebSocketBroadcaster();
  const engine = new SimulationEngine(services, broadcaster.broadcast.bind(broadcaster));

  // ── REST routes ──────────────────────────────────────────────────────────
  await app.register(servicesRoutes, { prefix: '/api', engine });
  await app.register(alertsRoutes, { prefix: '/api', engine });
  await app.register(dashboardRoutes, { prefix: '/api', engine });
  await app.register(flagsRoutes, { prefix: '/api' });

  // ── WebSocket stream endpoint ────────────────────────────────────────────
  app.get('/api/stream', { websocket: true }, (socket) => {
    broadcaster.addClient(socket);
    app.log.info(`WebSocket client connected (total: ${broadcaster.connectionCount})`);

    // Send a welcome / handshake so the client knows it's connected
    socket.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));

    socket.on('close', () => {
      broadcaster.removeClient(socket);
      app.log.info(`WebSocket client disconnected (total: ${broadcaster.connectionCount})`);
    });

    socket.on('error', (err) => {
      app.log.error({ err }, 'WebSocket error');
      broadcaster.removeClient(socket);
    });
  });

  // ── Health check ─────────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));

  // ── Start ─────────────────────────────────────────────────────────────────
  await app.listen({ port: PORT, host: HOST });
  engine.start();
  app.log.info(`BFF server running on http://${HOST}:${PORT}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
