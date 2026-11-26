import Fastify from 'fastify';
import { healthResponse } from '@labs/shared';
export function buildApp() {
  const app = Fastify({ logger: true });
  app.get('/health', async () => healthResponse());
  return app;
}
