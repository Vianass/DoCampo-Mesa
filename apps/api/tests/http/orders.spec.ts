import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import type { AuthService } from '../../src/modules/auth/auth.service.js';
import { unauthorized } from '../../src/modules/auth/auth.service.js';
import type { OrdersService } from '../../src/modules/orders/orders.service.js';
import { authConfiguration } from '../support/auth-fixtures.js';
import { Types } from 'mongoose';

const id = new Types.ObjectId().toHexString();
const token = 'ZXhhbXBsZQ.dGVzdA.c2lnbmF0dXJl';
let roles = ['comprador'];
const checkout = vi.fn(),
  list = vi.fn(),
  detail = vi.fn();
const auth = {
  prepare: vi.fn(),
  register: vi.fn(),
  login: vi.fn(),
  authenticate: vi.fn(async (value: string) => {
    if (value !== token) throw unauthorized();
    return { id, nome: 'Pessoa fictícia', email: 'ficticia@example.invalid', papeis: roles };
  }),
} as AuthService;
const service = { prepare: vi.fn(), checkout, list, detail } as OrdersService;
const security = authConfiguration();
const app = createApp({ orders: service, auth, security });
const bearer = (req: request.Test) => req.set('Authorization', 'Bearer ' + token);
beforeEach(() => {
  roles = ['comprador'];
  vi.clearAllMocks();
  checkout.mockResolvedValue({
    status: 201,
    body: { operacaoCompraId: 'compra-ficticia' },
    location: '/api/orders/' + id,
  });
  list.mockResolvedValue({ itens: [], pagina: 1, porPagina: 12, total: 0, totalPaginas: 0 });
  detail.mockResolvedValue({ id });
});
describe('fronteira HTTP autenticada de orders', () => {
  it.each(['get', 'post'] as const)('JWT ausente em %s não alcança o serviço', async (method) => {
    await request(app)[method]('/api/orders').send({}).expect(401);
    expect(checkout).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });
  it('JWT inválido é recusado', async () => {
    await request(app)
      .get('/api/orders/' + id)
      .set('Authorization', 'Bearer token-invalido')
      .expect(401);
    expect(detail).not.toHaveBeenCalled();
  });
  it.each(['produtor', 'administrador'])(
    'papel %s não substitui capacidade compradora',
    async (role) => {
      roles = [role];
      await bearer(request(app).post('/api/orders')).send({}).expect(403);
      await bearer(request(app).get('/api/orders')).expect(403);
      await bearer(request(app).get('/api/orders/' + id)).expect(403);
    },
  );
  it('passa identidade autenticada, header e corpo separadamente sem mutação', async () => {
    const body = { linhas: [], condicoesPorProdutor: [] };
    const result = await bearer(request(app).post('/api/orders'))
      .set('Idempotency-Key', 'ficticia-123')
      .send(body)
      .expect(201);
    expect(checkout).toHaveBeenCalledWith(expect.objectContaining({ id }), 'ficticia-123', body);
    expect(result.headers.location).toBe('/api/orders/' + id);
    expect(result.headers['cache-control']).toBe('no-store');
  });
  it('header ausente não ganha uma chave gerada pelo servidor', async () => {
    await bearer(request(app).post('/api/orders')).send({}).expect(201);
    expect(checkout.mock.calls[0]![1]).toBeUndefined();
  });
  it('headers de idempotência duplicados são enviados como ausentes ao validador existente', async () => {
    await bearer(request(app).post('/api/orders'))
      .set({ 'Idempotency-Key': ['um', 'dois'] })
      .send({})
      .expect(201);
    expect(checkout.mock.calls[0]![1]).toBeUndefined();
  });
  it('exige JSON e rejeita query adicional', async () => {
    await bearer(request(app).post('/api/orders')).type('text').send('corpo').expect(415);
    await bearer(request(app).post('/api/orders?comprador=outro')).send({}).expect(400);
    expect(checkout).not.toHaveBeenCalled();
  });
  it('limite de 100 KiB impede payload excessivo', async () => {
    await bearer(request(app).post('/api/orders'))
      .send({ texto: 'x'.repeat(110000) })
      .expect(413);
    expect(checkout).not.toHaveBeenCalled();
  });
  it('lista utiliza query validada e identidade, sem owner arbitrário', async () => {
    await bearer(request(app).get('/api/orders?pagina=2&porPagina=24&ordem=antigas')).expect(200);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ id }), {
      pagina: 2,
      porPagina: 24,
      ordem: 'antigas',
    });
    await bearer(request(app).get('/api/orders?comprador=outro')).expect(400);
  });
  it('detalhe valida ID e query', async () => {
    await bearer(request(app).get('/api/orders/' + id.toUpperCase())).expect(200);
    expect(detail).toHaveBeenCalledWith(expect.objectContaining({ id }), id);
    await bearer(request(app).get('/api/orders/invalido')).expect(400);
    await bearer(request(app).get('/api/orders/' + id + '?papel=administrador')).expect(400);
  });
  it('CORS permite a chave só para origens autorizadas', async () => {
    const response = await request(app)
      .options('/api/orders')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Authorization,Content-Type,Idempotency-Key')
      .expect(204);
    expect(response.headers['access-control-allow-headers']).toContain('Idempotency-Key');
    await request(app)
      .options('/api/orders')
      .set('Origin', 'http://origem-invalida.test')
      .set('Access-Control-Request-Method', 'POST')
      .expect(403);
  });
  it('composição sem autenticação permanece fechada', async () => {
    await request(createApp({ orders: service }))
      .get('/api/orders')
      .expect(401);
  });
  it('falhas inesperadas usam o envelope seguro sem detalhes da persistência', async () => {
    checkout.mockRejectedValue(Error('Detalhe privado da base de dados'));
    const response = await bearer(request(app).post('/api/orders')).send({}).expect(500);
    expect(response.body).toEqual({
      codigo: 'ERRO_INTERNO',
      mensagem: 'Não foi possível concluir o pedido.',
    });
  });
});
