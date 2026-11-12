import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { documentedApi, sourceOpenApi } from '../../src/documentation/openapi.js';
import type { ApiRoute } from '../../src/documentation/route-inventory.js';

describe('Swagger UI real e inventário', () => {
  it('serve HTML, assets locais e OpenAPI 3 sem relaxar a CSP da API', async () => {
    const app = createApp();
    const html = await request(app).get('/api-docs').expect(200);
    expect(html.headers['content-type']).toContain('text/html');
    expect(html.text).toContain('swagger-ui-bundle.js');
    expect(html.headers['content-security-policy']).toContain("script-src 'self'");
    expect(html.headers['content-security-policy']).not.toContain('unsafe-eval');
    for (const path of [
      'swagger-ui-bundle.js',
      'swagger-ui.css',
      'docs.css',
      'initializer.js',
      'LICENSE',
      'NOTICE',
      'swagger-ui-bundle.js.LICENSE.txt',
    ])
      await request(app)
        .get('/api-docs/' + path)
        .expect(200);
    await request(app).get('/api-docs/swagger-initializer.js').expect(404);
    const api = await request(app).get('/api/health').expect(200);
    expect(api.headers['content-security-policy']).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    const spec = await request(app).get('/api-docs/openapi.json').expect(200);
    expect(spec.body.openapi).toBe('3.0.3');
    expect(spec.body.servers).toEqual([
      { url: '/api', description: 'API deste servidor; sem credenciais na URL.' },
    ]);
    expect(spec.body.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    expect(Object.keys(spec.body.paths).sort()).toEqual(['/health', '/ready']);
  });
  it('não persiste tokens, não carrega validadores e não aceita configuração por query', async () => {
    const response = await request(createApp()).get('/api-docs/initializer.js').expect(200);
    for (const value of [
      'persistAuthorization: false',
      'queryConfigEnabled: false',
      'validatorUrl: null',
      'url.origin !== window.location.origin',
    ])
      expect(response.text).toContain(value);
    expect(response.text).not.toMatch(/localStorage|sessionStorage|eyJ[A-Za-z0-9]/);
  });
  it('o contrato publicado corresponde exatamente aos routers completos, sem propostas', async () => {
    const stub = new Proxy({}, { get: () => vi.fn() });
    const app = createApp(
      Object.fromEntries(
        [
          'auth',
          'catalog',
          'orders',
          'receipt',
          'preparation',
          'producerOrders',
          'auctions',
          'producerApplications',
          'producerManagement',
          'images',
          'admin',
          'adminOrders',
          'adminAuctions',
          'reviews',
          'moderation',
        ].map((k) => [k, stub]),
      ),
    );
    const routes: ApiRoute[] = app.locals.apiRoutes,
      spec = (await request(app).get('/api-docs/openapi.json').expect(200)).body;
    const operations = Object.entries(spec.paths as Record<string, object>)
      .flatMap(([path, methods]) => Object.keys(methods).map((method) => method + ':' + path))
      .sort();
    expect(operations).toEqual(routes.map((r) => r.method + ':' + r.path).sort());
    expect(new Set(operations).size).toBe(78);
    expect(operations).toContain('get:/auctions/{id}/checkout');
    expect(operations).toContain('post:/auctions/{id}/checkout');
    expect(operations).toContain('patch:/orders/{id}/estado');
    expect(operations).toContain('post:/me/products/{id}/images');
    expect(JSON.stringify(spec.paths)).not.toContain('proposta-bloqueada');
    expect(operations).not.toContain('get:/admin/services');
    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) return value.forEach(visit);
      for (const [k, v] of Object.entries(value)) {
        if (k === '$ref') {
          expect(String(v)).toMatch(/^#\//);
          let target: unknown = spec;
          for (const part of String(v).slice(2).split('/'))
            target = (target as Record<string, unknown>)?.[
              part.replaceAll('~1', '/').replaceAll('~0', '~')
            ];
          expect(target).toBeDefined();
        } else visit(v);
      }
    };
    visit(spec);
  });
  it('recusa publicar uma operação não documentada', () => {
    expect(() => documentedApi([{ method: 'get', path: '/nao-documentado' }])).toThrow(
      'Contrato OpenAPI em falta',
    );
    expect(sourceOpenApi().paths['/admin/services']?.get?.['x-contract-status']).toBe(
      'proposta-bloqueada',
    );
  });
  it('aceita a própria origem do Swagger e recusa outras origens', async () => {
    const app = createApp();
    await request(app)
      .post('/api/auth/absent')
      .set('Host', 'api.example.invalid')
      .set('Origin', 'http://api.example.invalid')
      .expect(404);
    await request(app)
      .get('/api-docs')
      .set('Host', 'api.example.invalid')
      .set('Origin', 'https://intruso.invalid')
      .expect(403);
  });
  it('mantém HTTPS obrigatório com confiança de proxy explícita', async () => {
    const noProxy = createApp({
      security: { production: true, allowedOrigins: [], trustedProxies: [] },
    });
    await request(noProxy).get('/api-docs').set('X-Forwarded-Proto', 'https').expect(400);
    const trusted = createApp({
      security: {
        production: true,
        allowedOrigins: [],
        trustedProxies: ['127.0.0.1', '::ffff:127.0.0.1'],
      },
    });
    const r = await request(trusted).get('/api-docs').set('X-Forwarded-Proto', 'https').expect(200);
    expect(r.headers['strict-transport-security']).toContain('max-age=31536000');
  });
  it.each([true, false])(
    'prontidão observada %s não é a mesma coisa que liveness',
    async (ready) => {
      const app = createApp({ readiness: async () => ready });
      const r = await request(app)
        .get('/api/ready')
        .expect(ready ? 200 : 503);
      expect(r.body).toEqual({
        estado: ready ? 'operacional' : 'indisponivel',
        ambito: 'api-mongodb',
      });
      await request(app).get('/api/health').expect(200);
    },
  );
  it('prontidão não configurada, falha ou query extra não inventa disponibilidade nem expõe detalhes', async () => {
    await request(createApp()).get('/api/ready').expect(503);
    const r = await request(
      createApp({
        readiness: async () => {
          throw Error('URI privada fictícia');
        },
      }),
    )
      .get('/api/ready')
      .expect(503);
    expect(r.text).not.toContain('privada');
    await request(createApp()).get('/api/ready?host=example.invalid').expect(400);
  });
});
