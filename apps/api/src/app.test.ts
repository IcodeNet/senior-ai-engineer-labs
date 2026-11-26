import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
describe('health endpoint', () => {
  it('returns healthy status', async () => {
    const app = buildApp();
    try { const res = await app.inject({ method: 'GET', url: '/health' }); expect(res.statusCode).toBe(200); expect(res.json()).toEqual({ status: 'ok' }); }
    finally { await app.close(); }
  });
});
