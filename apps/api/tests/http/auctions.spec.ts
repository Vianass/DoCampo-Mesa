import request from 'supertest';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { unauthorized, type AuthService } from '../../src/modules/auth/auth.service.js';
import type { AuctionService } from '../../src/modules/auctions/auction.service.js';
import { authConfiguration } from '../support/auth-fixtures.js';

// Duplicados de transporte apenas; consistência e permissões reais são testadas no replica set.
const id = new Types.ObjectId().toHexString();
const token = 'ZXhhbXBsZQ.dGVzdA.c2lnbmF0dXJl';
let roles = ['produtor'];
const list = vi.fn(),
  create = vi.fn(),
  detail = vi.fn(),
  edit = vi.fn(),
  cancel = vi.fn(),
  bid = vi.fn(),
  history = vi.fn();
const service = { list, create, detail, edit, cancel, bid, history } as unknown as AuctionService;
const auth = {
  authenticate: vi.fn(async (value: string) => {
    if (value !== token) throw unauthorized();
    return { id, nome: 'Conta fictícia', email: 'teste@example.invalid', papeis: roles };
  }),
} as unknown as AuthService;
const security = authConfiguration();
const app = createApp({
  auth,
  auctions: service,
  security,
  auctionLimits: { ipLimit: 10000, accountLimit: 10000 },
});
const bearer = (r: request.Test) => r.set('Authorization', 'Bearer ' + token);
beforeEach(() => {
  vi.clearAllMocks();
  roles = ['produtor'];
  list.mockResolvedValue({ itens: [], total: 0 });
  for (const fn of [create, detail, edit, cancel])
    fn.mockResolvedValue({ status: 201, body: { id }, etag: '"teste"' });
  bid.mockResolvedValue({ status: 201, body: { origem: 'nova' } });
  history.mockResolvedValue({ itens: [] });
});
describe('fronteira HTTP de leilões', () => {
  it('resumo público e paginação não concedem identidade', async () => {
    await request(app).get('/api/auctions?pagina=2&porPagina=24&estado=ativo').expect(200);
    expect(list).toHaveBeenCalledWith({
      pagina: 2,
      porPagina: 24,
      ordem: 'recentes',
      estado: 'ativo',
    });
    expect(auth.authenticate).not.toHaveBeenCalled();
  });
  it.each(['/api/auctions/' + id, '/api/auctions/' + id + '/bids', '/api/me/producer/auctions'])(
    'GET privado %s exige JWT',
    async (path) => {
      await request(app).get(path).expect(401);
      expect(detail).not.toHaveBeenCalled();
      expect(history).not.toHaveBeenCalled();
      expect(list).not.toHaveBeenCalled();
    },
  );
  it.each(['comprador', 'administrador'])(
    'papel %s não cria leilões nem consulta catálogo privado',
    async (role) => {
      roles = [role];
      await bearer(request(app).post('/api/auctions')).send({}).expect(403);
      await bearer(request(app).get('/api/me/producer/auctions')).expect(403);
      expect(create).not.toHaveBeenCalled();
    },
  );
  it.each(['produtor', 'administrador'])('papel %s isolado não licita', async (role) => {
    roles = [role];
    await bearer(request(app).post('/api/auctions/' + id + '/bids'))
      .send({ valorCent: 100 })
      .expect(403);
    expect(bid).not.toHaveBeenCalled();
  });
  it('identidade vem do JWT e não do corpo; ETag e Location são devolvidos', async () => {
    const body = { titulo: 'Lote fictício' };
    const r = await bearer(request(app).post('/api/auctions'))
      .set('Idempotency-Key', 'chave-ficticia')
      .send(body)
      .expect(201);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ id }), body, 'chave-ficticia');
    expect(r.headers.location).toBe('/api/auctions/' + id);
    expect(r.headers.etag).toBe('"teste"');
    expect(r.headers['cache-control']).toBe('no-store');
  });
  it('encaminha If-Match sem fabricar versão', async () => {
    await bearer(request(app).put('/api/auctions/' + id))
      .set('If-Match', '"etag"')
      .send({})
      .expect(200);
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ id }), id, {}, '"etag"');
  });
  it.each(['Idempotency-Key', 'If-Match'])('recusa cabeçalho duplicado %s', async (header) => {
    const path = '/api/auctions' + (header === 'If-Match' ? '/' + id + '/cancel' : '');
    await bearer(request(app).post(path))
      .set({ [header]: ['um', 'dois'] })
      .send({})
      .expect(400);
    expect(create).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });
  it.each([
    '?owner=outro',
    '?pagina=0',
    '?estado=inexistente',
    '?porPagina=1000',
    '?pagina=1&pagina=2',
  ])('recusa query %s', async (query) => {
    await request(app)
      .get('/api/auctions' + query)
      .expect(400);
    expect(list).not.toHaveBeenCalled();
  });
  it('identificador inválido não chega ao serviço', async () => {
    await bearer(request(app).get('/api/auctions/invalido')).expect(400);
    expect(detail).not.toHaveBeenCalled();
  });
  it('JSON obrigatório, estrito e limitado a 100 KiB', async () => {
    await bearer(request(app).post('/api/auctions')).type('text').send('texto').expect(415);
    await bearer(request(app).post('/api/auctions')).type('json').send('{').expect(400);
    await bearer(request(app).post('/api/auctions'))
      .send({ texto: 'x'.repeat(110000) })
      .expect(413);
    await bearer(request(app).post('/api/auctions/' + id + '/cancel'))
      .send({ estado: 'cancelado' })
      .expect(400);
    expect(create).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });
  it('falhas internas são sanitizadas', async () => {
    list.mockRejectedValueOnce(Error('mongodb://privado:segredo@interno/dados'));
    const r = await request(app).get('/api/auctions').expect(500);
    expect(r.body).toEqual({
      codigo: 'ERRO_INTERNO',
      mensagem: 'Não foi possível concluir o pedido.',
    });
  });
  it('limite por IP devolve 429 e Retry-After; não afeta health e expira', async () => {
    let now = 0;
    const limited = createApp({
      auth,
      auctions: service,
      security,
      auctionLimits: { ipLimit: 1, windowMs: 1000, now: () => now },
    });
    await request(limited).get('/api/auctions').expect(200);
    const r = await request(limited).get('/api/auctions').expect(429);
    expect(r.headers['retry-after']).toBe('1');
    await request(limited).get('/api/health').expect(200);
    now = 1001;
    await request(limited).get('/api/auctions').expect(200);
  });
  it('limita mutações por conta e não só por IP', async () => {
    const limited = createApp({
      auth,
      auctions: service,
      security,
      auctionLimits: { ipLimit: 100, accountLimit: 1 },
    });
    await bearer(request(limited).post('/api/auctions')).send({}).expect(201);
    await bearer(request(limited).post('/api/auctions')).send({}).expect(429);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
