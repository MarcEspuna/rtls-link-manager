import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { deviceRoutes } from './routes/devices.js';
// import { templateRoutes } from './routes/templates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({ logger: true });

async function start() {
  await app.register(cors, { origin: true });

  // API routes
  await app.register(deviceRoutes, { prefix: '/api' });
  // await app.register(templateRoutes, { prefix: '/api' });

  // Serve UI in production
  if (process.env.NODE_ENV === 'production') {
    await app.register(fastifyStatic, {
      root: path.resolve(process.cwd(), '../ui/dist'),
    });

    // SPA fallback
    app.setNotFoundHandler((req, reply) => {
      reply.sendFile('index.html');
    });
  }

  const port = process.env.PORT || 3000;
  await app.listen({ port: Number(port), host: '0.0.0.0' });

  console.log(`Swarm Tool running at http://localhost:${port}`);
}

start();
