import request from 'supertest';
import { createServer, type IncomingMessage } from 'node:http';
import { it, expect, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { parseAuthEnvironment } from '../../src/config/auth-environment.js';
import { createApp } from '../../src/app.js';
import type { AuthService } from '../../src/modules/auth/auth.service.js';
import { socketPeer, allowSocketRequest } from '../../src/realtime/socket.security.js';

const config = parseAuthEnvironment({
  NODE_ENV: 'production',
  RENDER: 'true',
  PROXY_MODE: 'render',
  JWT_SECRET: randomBytes(48).toString('base64url'),
  CORS_ORIGINS: 'https://web.example.invalid',
});
it('HTTPS/CORS de um único ingress funciona sem confiar em IPs fornecidos à esquerda pelo cliente', async () => {
  const service = {
    login: vi.fn().mockResolvedValue({ autenticacao: 'resultado fictício do serviço isolado' }),
  } as unknown as AuthService;
  const app = createApp({
    security: config,
    auth: service,
    rateLimit: { ipLimit: 1, accountLimit: 100 },
  });
  const send = (chain: string) =>
    request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-For', chain)
      .set('Origin', 'https://web.example.invalid')
      .send({ email: 'proxy@example.invalid', password: 'Password fictícia de teste' });
  const r = await send('192.0.2.9, 203.0.113.4').expect(200);
  expect(r.headers['access-control-allow-origin']).toBe('https://web.example.invalid');
  await send('198.51.100.7, 203.0.113.4').expect(429);
  await send('192.0.2.9, 203.0.113.5').expect(200);
  expect(service.login).toHaveBeenCalledTimes(2);
  await request(app).get('/api/health').set('X-Forwarded-Proto', 'https').expect(400);
  await request(app)
    .get('/api/health')
    .set('X-Forwarded-Proto', 'https, http')
    .set('X-Forwarded-For', '203.0.113.4')
    .expect(400);
  await request(app)
    .get('/api/health')
    .set('X-Forwarded-Proto', 'https')
    .set('X-Forwarded-For', '203.0.113.4')
    .set('Origin', 'https://intruso.invalid')
    .expect(403);
});
it('preflight entre os domínios preserva ETag, JWT e a lista restrita de cabeçalhos', async () => {
  const r = await request(createApp({ security: config }))
    .options('/api/products')
    .set('X-Forwarded-Proto', 'https')
    .set('X-Forwarded-For', '203.0.113.4')
    .set('Origin', 'https://web.example.invalid')
    .set('Access-Control-Request-Method', 'PUT')
    .set('Access-Control-Request-Headers', 'Authorization, Content-Type, If-Match')
    .expect(204);
  expect(r.headers['access-control-allow-headers']).toContain('If-Match');
  expect(r.headers['access-control-allow-credentials']).toBeUndefined();
});
it('Socket.IO aplica a mesma fronteira de proxy e mantém a recusa de tokens na query', async () => {
  const server = createServer();
  const message = {
    headers: {
      'x-forwarded-for': '192.0.2.9, 203.0.113.4',
      'x-forwarded-proto': 'https',
      origin: 'https://web.example.invalid',
    },
    socket: { remoteAddress: '10.0.0.2' },
    url: '/socket.io/?EIO=4&transport=websocket',
  } as unknown as IncomingMessage;
  expect(socketPeer(message, config)).toEqual({ ip: '203.0.113.4', secure: true });
  expect(allowSocketRequest(message, config)).toBe(true);
  expect(
    allowSocketRequest(
      { ...message, url: message.url + '&token=invalido' } as unknown as IncomingMessage,
      config,
    ),
  ).toBe(false);
  expect(
    allowSocketRequest(
      {
        ...message,
        headers: { ...message.headers, 'x-forwarded-proto': 'http' },
      } as unknown as IncomingMessage,
      config,
    ),
  ).toBe(false);
  expect(server.listening).toBe(false);
});
