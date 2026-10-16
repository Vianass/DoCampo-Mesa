import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { ApiError } from '../../src/http/api-error.js';
import { errorHandler } from '../../src/http/error-handler.js';
import { validate } from '../../src/http/validate.js';

describe('fundação HTTP', () => {
  it('responde ao diagnóstico sem anunciar MongoDB/Cloud ou expor dados internos', async () => {
    const response = await request(createApp()).get('/api/health').expect(200);
    expect(response.body).toEqual({ estado: 'operacional', ambito: 'processo-http' });
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('valida a query técnica e não aceita opções arbitrárias', async () => {
    const response = await request(createApp()).get('/api/health?papel=administrador').expect(400);
    expect(response.body).toMatchObject({
      codigo: 'PEDIDO_INVALIDO',
      campos: [{ campo: 'pedido' }],
    });
  });

  it.each([
    ['get', '/api/me'],
    ['get', '/api/admin/users'],
    ['post', '/api/products'],
    ['put', '/api/products/exemplo'],
    ['delete', '/api/products/exemplo'],
    ['post', '/api/orders'],
    ['patch', '/api/orders/exemplo/estado'],
    ['post', '/api/auth/login'],
    ['post', '/api/auth/registo'],
    ['get', '/api/products'],
  ] as const)(
    'não disponibiliza %s %s, mesmo com credenciais/papel demonstrativos',
    async (method, path) => {
      const agent = request(createApp());
      const response = await agent[method](path)
        .set('Authorization', 'Bearer token-demonstrativo')
        .set('X-Role', 'administrador')
        .set('X-User-Id', 'DEMO_ADMIN')
        .expect(404);
      expect(response.body).toEqual({
        codigo: 'ROTA_NAO_ENCONTRADA',
        mensagem: 'O recurso pedido não está disponível.',
      });
    },
  );

  it('devolve 400 para JSON inválido sem ecoar o corpo', async () => {
    const response = await request(createApp())
      .post('/api/orders')
      .set('Content-Type', 'application/json')
      .send('{"segredo":"privado"')
      .expect(400);
    expect(response.body.codigo).toBe('JSON_INVALIDO');
    expect(JSON.stringify(response.body)).not.toContain('privado');
  });

  it('limita corpos JSON sem revelar o conteúdo', async () => {
    const response = await request(createApp())
      .post('/api/orders')
      .send({ valor: 'x'.repeat(110_000) })
      .expect(413);
    expect(response.body.codigo).toBe('PEDIDO_DEMASIADO_GRANDE');
  });

  it('identifica campos inválidos e permite consumir dados validados num harness apenas interno', async () => {
    const harness = express();
    harness.use(express.json());
    harness.post(
      '/validacao',
      validate(z.strictObject({ nome: z.string().min(1) }), (req) => req.body),
      (_req, res) => res.json(res.locals.validated),
    );
    harness.use(errorHandler);
    const invalid = await request(harness).post('/validacao').send({ nome: 42 }).expect(400);
    expect(invalid.body.campos).toEqual([
      { campo: 'nome', mensagem: 'Campo inválido ou não permitido.' },
    ]);
    await request(harness)
      .post('/validacao')
      .send({ nome: 'Teste técnico' })
      .expect(200, { nome: 'Teste técnico' });
    await request(harness)
      .post('/validacao')
      .send({ nome: 'Teste', papel: 'administrador' })
      .expect(400);
  });

  it('normaliza erros inesperados, incluindo rejeições assíncronas de Express 5', async () => {
    const harness = express();
    harness.get('/falha-interna', async () => {
      throw new Error('mongodb://conta:segredo@interno stack');
    });
    harness.use(errorHandler);
    const response = await request(harness).get('/falha-interna').expect(500);
    expect(response.body).toEqual({
      codigo: 'ERRO_INTERNO',
      mensagem: 'Não foi possível concluir o pedido.',
    });
  });

  it.each([400, 401, 403, 404, 409, 500])(
    'representa HTTP %s com código estável e mensagem controlada',
    async (status) => {
      const harness = express();
      harness.get('/erro-controlado', (_req, _res, next) =>
        next(new ApiError(status, 'ERRO_TECNICO', 'Mensagem controlada.')),
      );
      harness.use(errorHandler);
      await request(harness)
        .get('/erro-controlado')
        .expect(status, { codigo: 'ERRO_TECNICO', mensagem: 'Mensagem controlada.' });
    },
  );
});
