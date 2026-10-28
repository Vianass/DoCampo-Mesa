import { randomUUID } from 'node:crypto';
import { Types, mongo } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { connectDatabase } from '../../src/database/connection.js';
import { parseEnvironment } from '../../src/config/environment.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createAuctionService } from '../../src/modules/auctions/auction.service.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import { createProductModel } from '../../src/modules/products/product.model.js';
import { createOrdersService } from '../../src/modules/orders/orders.service.js';
import { authConfiguration, authToken } from '../support/auth-fixtures.js';
import { seedAuctionActors } from '../support/auction-fixtures.js';
let database: Awaited<ReturnType<typeof connectDatabase>>,
  service: ReturnType<typeof createAuctionService>,
  app: ReturnType<typeof createApp>;
const config = authConfiguration(),
  c = () => database.connection;
beforeAll(async () => {
  database = await connectDatabase(
    parseEnvironment({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      MONGODB_DB_NAME: 'docampo_test_' + randomUUID().replaceAll('-', ''),
    }),
  );
  const auth = createAuthService(c(), config);
  await auth.prepare();
  service = createAuctionService(c(), config.secret);
  await service.prepare();
  app = createApp({
    auth,
    auctions: service,
    security: config,
    auctionLimits: { ipLimit: 100000, accountLimit: 100000 },
  });
});
afterAll(async () => {
  if (database) {
    try {
      await c().dropDatabase();
    } finally {
      await database.close();
    }
  }
});
async function subject(count = 2) {
  const s = await seedAuctionActors(c(), count);
  return {
    ...s,
    sellerToken: await authToken(config, s.seller.id),
    buyerTokens: await Promise.all(s.buyers.map((u) => authToken(config, u.id))),
  };
}
type Subject = Awaited<ReturnType<typeof subject>>;
const create = (s: Subject, body: object = s.body, k = randomUUID()) =>
  request(app)
    .post('/api/auctions')
    .set('Authorization', 'Bearer ' + s.sellerToken)
    .set('Idempotency-Key', k)
    .send(body);
const read = (s: Subject, id: string) =>
  request(app)
    .get('/api/auctions/' + id)
    .set('Authorization', 'Bearer ' + s.buyerTokens[0]);
const offer = (s: Subject, id: string, value = 30100, i = 0, k = randomUUID()) =>
  request(app)
    .post('/api/auctions/' + id + '/bids')
    .set('Authorization', 'Bearer ' + s.buyerTokens[i])
    .set('Idempotency-Key', k)
    .send({ valorCent: value });
const stock = (s: Subject) =>
  c().db!.collection('products').findOne({ _id: s.scenario.products[0]!._id });
const auction = (id: string) =>
  c()
    .db!.collection('auctions')
    .findOne({ _id: new Types.ObjectId(id) });
async function expire(id: string) {
  const now = new Date();
  await c()
    .db!.collection('auctions')
    .updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $set: {
          iniciaEm: new Date(now.getTime() - 2000),
          terminaEm: new Date(now.getTime() - 1000),
        },
      },
    );
}
describe('leilões REST em replica set real', () => {
  it('criação reserva stock e resumo público não expõe compradores, chaves ou auditoria', async () => {
    const s = await subject(),
      r = await create(s).expect(201);
    expect((await stock(s))!.stockDisponivel).toBe(9500);
    expect(r.body).toMatchObject({
      estado: 'ativo',
      sequencia: 0,
      licitacaoAtual: { valorCent: 30000, bidId: null },
    });
    const rows = await request(app).get('/api/auctions').expect(200);
    const row = rows.body.itens.find((a: { id: string }) => a.id === r.body.id);
    expect(row).toBeDefined();
    expect(JSON.stringify(row)).not.toMatch(
      /comprador|requestId|requestHash|criacao|historico|reserva|email|telefone|password/,
    );
  });
  it('criação idempotente não duplica lote nem débito; conteúdo diferente causa conflito', async () => {
    const s = await subject(),
      k = randomUUID(),
      a = await create(s, s.body, k).expect(201),
      b = await create(s, s.body, k).expect(200);
    expect(a.body.id).toBe(b.body.id);
    await create(s, { ...s.body, titulo: 'Diferente' }, k).expect(409);
    expect((await stock(s))!.stockDisponivel).toBe(9500);
    expect(
      await c()
        .db!.collection('auctions')
        .countDocuments({ produtor: new Types.ObjectId(s.seller.id) }),
    ).toBe(1);
  });
  it('JWT obrigatório em criação, detalhe, histórico e ofertas', async () => {
    const id = new Types.ObjectId().toHexString();
    await request(app).post('/api/auctions').send({}).expect(401);
    await request(app)
      .get('/api/auctions/' + id)
      .expect(401);
    await request(app)
      .get('/api/auctions/' + id + '/bids')
      .expect(401);
    await request(app)
      .post('/api/auctions/' + id + '/bids')
      .send({ valorCent: 30100 })
      .expect(401);
  });
  it.each(['papel', 'inativa', 'aprovacao'])(
    'criação verifica capacidade atual: %s',
    async (kind) => {
      const s = await subject();
      if (kind === 'aprovacao') {
        const p = await createProducerModel(c())
          .findById(s.scenario.producers[0]!._id)
          .select('+telefone +aprovacao.decisao.autor +comercial.pagamentoPrivado')
          .orFail();
        p.aprovacao.estado = 'rejeitado';
        p.aprovacao.decisao!.justificacao = 'Decisão fictícia';
        await p.save();
      } else {
        const u = await createUserModel(c()).findById(s.seller.id).select('+passwordHash').orFail();
        if (kind === 'papel') u.papeis = ['comprador'];
        else u.ativo = false;
        await u.save();
      }
      await create(s).expect(kind === 'inativa' ? 401 : 403);
      expect((await stock(s))!.stockDisponivel).toBe(10000);
    },
  );
  it('produto de outro produtor não pode ser reservado', async () => {
    const a = await subject(),
      b = await subject();
    await create(a, { ...a.body, produtoId: b.body.produtoId }).expect(404);
    expect((await stock(b))!.stockDisponivel).toBe(10000);
  });
  it.each(['rascunho', 'arquivado', 'esgotado'])('recusa produto inelegível %s', async (kind) => {
    const s = await subject(),
      p = await createProductModel(c()).findById(s.body.produtoId).orFail();
    if (kind === 'esgotado') p.stockDisponivel = 0;
    else p.estadoPublicacao = kind as 'rascunho' | 'arquivado';
    await p.save();
    await create(s).expect(409);
    expect(
      await c()
        .db!.collection('auctions')
        .countDocuments({ produtor: new Types.ObjectId(s.seller.id) }),
    ).toBe(0);
  });
  it.each([
    { precoBaseCent: -1 },
    { incrementoCent: 0 },
    { incrementoCent: 1.5 },
    { terminaEm: 'inválido' },
    { terminaEm: new Date(0).toISOString() },
    { produtorId: 'livre' },
    { quantidade: 1 },
  ])('valida campos/preço/datas/quantidade %j', async (extra) => {
    const s = await subject();
    const r = await create(s, { ...s.body, ...extra });
    expect([400, 409]).toContain(r.status);
    expect((await stock(s))!.stockDisponivel).toBe(10000);
  });
  it('edição só antes do início, com PUT completo e If-Match forte', async () => {
    const s = await subject(),
      body = {
        ...s.body,
        iniciaEm: new Date(Date.now() + 60000).toISOString(),
        terminaEm: new Date(Date.now() + 120000).toISOString(),
      },
      a = await create(s, body).expect(201);
    const { produtoId, quantidade, ...edit } = body;
    expect(produtoId && quantidade).toBeTruthy();
    const r = await request(app)
      .put('/api/auctions/' + a.body.id)
      .set('Authorization', 'Bearer ' + s.sellerToken)
      .set('If-Match', a.headers.etag!)
      .send({ ...edit, titulo: 'Título atualizado' })
      .expect(200);
    expect(r.body.titulo).toBe('Título atualizado');
    expect(r.headers.etag).not.toBe(a.headers.etag);
    await request(app)
      .put('/api/auctions/' + a.body.id)
      .set('Authorization', 'Bearer ' + s.sellerToken)
      .set('If-Match', a.headers.etag!)
      .send(edit)
      .expect(412);
    expect((await stock(s))!.stockDisponivel).toBe(9500);
  });
  it('edição não reescreve leilão iniciado nem lote', async () => {
    const s = await subject(),
      a = await create(s).expect(201);
    const { produtoId, quantidade, ...edit } = s.body;
    expect(produtoId && quantidade).toBeTruthy();
    await request(app)
      .put('/api/auctions/' + a.body.id)
      .set('Authorization', 'Bearer ' + s.sellerToken)
      .set('If-Match', a.headers.etag!)
      .send(edit)
      .expect(409);
    await request(app)
      .put('/api/auctions/' + a.body.id)
      .set('Authorization', 'Bearer ' + s.sellerToken)
      .set('If-Match', a.headers.etag!)
      .send({ ...edit, quantidade: 1000 })
      .expect(400);
  });
  it('cancelamento sem ofertas devolve stock uma vez e conserva histórico', async () => {
    const s = await subject(),
      a = await create(s).expect(201);
    const r = await request(app)
      .post('/api/auctions/' + a.body.id + '/cancel')
      .set('Authorization', 'Bearer ' + s.sellerToken)
      .set('If-Match', a.headers.etag!)
      .send({})
      .expect(200);
    expect(r.body.estado).toBe('cancelado');
    expect((await stock(s))!.stockDisponivel).toBe(10000);
    await request(app)
      .post('/api/auctions/' + a.body.id + '/cancel')
      .set('Authorization', 'Bearer ' + s.sellerToken)
      .set('If-Match', r.headers.etag!)
      .send({})
      .expect(409);
    await offer(s, a.body.id).expect(409);
    expect(await service.advance(new Types.ObjectId(a.body.id))).toBe(false);
  });
  it('não cancela depois da primeira oferta e não permite proprietário alheio', async () => {
    const s = await subject(),
      other = await subject(),
      a = await create(s).expect(201);
    await offer(s, a.body.id).expect(201);
    const d = await read(s, a.body.id);
    await request(app)
      .post('/api/auctions/' + a.body.id + '/cancel')
      .set('Authorization', 'Bearer ' + s.sellerToken)
      .set('If-Match', d.headers.etag!)
      .send({})
      .expect(409);
    await request(app)
      .post('/api/auctions/' + a.body.id + '/cancel')
      .set('Authorization', 'Bearer ' + other.sellerToken)
      .set('If-Match', d.headers.etag!)
      .send({})
      .expect(404);
  });
  it('primeira oferta exige base + incremento, persistindo liderança/seq/bid no mesmo commit', async () => {
    const s = await subject(),
      a = await create(s).expect(201);
    await offer(s, a.body.id, 30000).expect(409);
    const r = await offer(s, a.body.id, 30100).expect(201),
      db = await auction(a.body.id);
    expect(db!.sequencia).toBe(1);
    expect(db!.licitacaoAtual.comprador.equals(new Types.ObjectId(s.buyers[0]!.id))).toBe(true);
    expect(db!.licitacaoAtual.bidId.toHexString()).toBe(r.body.licitacao.id);
    expect(await c().db!.collection('bids').countDocuments({ leilao: db!._id })).toBe(1);
    expect((await stock(s))!.stockDisponivel).toBe(9500);
  });
  it('o produtor não licita no próprio lote mesmo tendo os dois papéis', async () => {
    const s = await subject(),
      a = await create(s).expect(201),
      u = await createUserModel(c()).findById(s.seller.id).select('+passwordHash').orFail();
    u.papeis = ['comprador', 'produtor'];
    await u.save();
    await request(app)
      .post('/api/auctions/' + a.body.id + '/bids')
      .set('Authorization', 'Bearer ' + s.sellerToken)
      .set('Idempotency-Key', randomUUID())
      .send({ valorCent: 30100 })
      .expect(403);
    expect((await auction(a.body.id))!.sequencia).toBe(0);
  });
  it('rejeita oferta antes do início e depois do fim sem alterar auction/bids', async () => {
    const s = await subject(),
      a = await create(s, {
        ...s.body,
        iniciaEm: new Date(Date.now() + 60000).toISOString(),
      }).expect(201),
      before = await auction(a.body.id);
    await offer(s, a.body.id).expect(409);
    expect(await auction(a.body.id)).toEqual(before);
    await expire(a.body.id);
    const ended = await auction(a.body.id);
    await offer(s, a.body.id).expect(409);
    expect(await auction(a.body.id)).toEqual(ended);
  });
  it('repetição da mesma chave recupera o bid, inclusive após o fim', async () => {
    const s = await subject(),
      a = await create(s).expect(201),
      k = randomUUID(),
      first = await offer(s, a.body.id, 30100, 0, k).expect(201);
    await expire(a.body.id);
    await service.advance(new Types.ObjectId(a.body.id));
    const replay = await offer(s, a.body.id, 30100, 0, k).expect(200);
    expect(replay.body.licitacao).toEqual(first.body.licitacao);
    expect(replay.body.leilao.estado).toBe('terminado');
    await offer(s, a.body.id, 30200, 0, k).expect(409);
    expect((await auction(a.body.id))!.sequencia).toBe(1);
  });
  it('duas ofertas iguais concorrentes só aceitam uma', async () => {
    const s = await subject(),
      a = await create(s).expect(201);
    const rs = await Promise.all([offer(s, a.body.id, 31700, 0), offer(s, a.body.id, 31700, 1)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    const db = await auction(a.body.id);
    expect(db!.sequencia).toBe(1);
    expect(await c().db!.collection('bids').countDocuments({ leilao: db!._id })).toBe(1);
  });
  it('compradores concorrentes têm ordem única e história coerente', async () => {
    const s = await subject(5),
      a = await create(s).expect(201),
      values = [30100, 30500, 30900, 31300, 31700];
    const rs = await Promise.all(values.map((v, i) => offer(s, a.body.id, v, i)));
    expect(rs.every((r) => [201, 409].includes(r.status))).toBe(true);
    const rows = await c()
      .db!.collection('bids')
      .find({ leilao: new Types.ObjectId(a.body.id) })
      .sort({ sequencia: 1 })
      .toArray();
    expect(rows.map((b) => b.sequencia)).toEqual(rows.map((_, i) => i + 1));
    let last = 30000;
    for (const row of rows) {
      expect(row.valorCent).toBeGreaterThanOrEqual(last + 100);
      last = row.valorCent;
    }
    const db = await auction(a.body.id);
    expect(db!.sequencia).toBe(rows.length);
    expect(db!.licitacaoAtual.valorCent).toBe(last);
    expect(last).toBe(31700);
  });
  it('pedidos concorrentes com a mesma chave geram um bid e um replay', async () => {
    const s = await subject(),
      a = await create(s).expect(201),
      k = randomUUID();
    const rs = await Promise.all([
      offer(s, a.body.id, 30100, 0, k),
      offer(s, a.body.id, 30100, 0, k),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 201]);
    expect((await auction(a.body.id))!.sequencia).toBe(1);
  });
  it('falha na inserção do bid reverte liderança, sequência e versão', async () => {
    const s = await subject(),
      a = await create(s).expect(201),
      before = await auction(a.body.id),
      original = mongo.Collection.prototype.insertOne;
    const spy = vi.spyOn(mongo.Collection.prototype, 'insertOne').mockImplementation(function (
      this: mongo.Collection,
      ...args: Parameters<typeof original>
    ) {
      if (this.collectionName === 'bids') throw Error('falha fictícia privada');
      return original.apply(this, args);
    } as typeof original);
    try {
      const r = await offer(s, a.body.id).expect(500);
      expect(JSON.stringify(r.body)).not.toContain('privada');
    } finally {
      spy.mockRestore();
    }
    expect(await auction(a.body.id)).toEqual(before);
    expect(await c().db!.collection('bids').countDocuments({ leilao: before!._id })).toBe(0);
  });
  it('fecho sem ofertas e repetição devolvem stock só uma vez', async () => {
    const s = await subject(),
      a = await create(s).expect(201);
    await expire(a.body.id);
    const first = await service.advance(new Types.ObjectId(a.body.id));
    expect(first).toBe(true);
    const db = await auction(a.body.id);
    expect(db).toMatchObject({
      estado: 'terminado',
      resultado: { tipo: 'sem_licitacoes', comprador: null, bidId: null, valorCent: null },
      reserva: { estado: 'libertada', reposta: 500, pendente: 0 },
    });
    expect(await service.advance(new Types.ObjectId(a.body.id))).toBe(false);
    expect((await stock(s))!.stockDisponivel).toBe(10000);
  });
  it('dois encerradores preservam um vencedor e mantêm o lote afeto', async () => {
    const s = await subject(),
      a = await create(s).expect(201),
      bid = await offer(s, a.body.id, 31700).expect(201);
    await expire(a.body.id);
    const other = createAuctionService(c(), config.secret);
    await Promise.all([
      service.advance(new Types.ObjectId(a.body.id)),
      other.advance(new Types.ObjectId(a.body.id)),
    ]);
    const db = await auction(a.body.id);
    expect(db).toMatchObject({
      estado: 'terminado',
      reserva: { estado: 'afeta_vencedor', reposta: 0, pendente: 0 },
      resultado: { tipo: 'vencedor', valorCent: 31700 },
    });
    expect(db!.resultado.bidId.toHexString()).toBe(bid.body.licitacao.id);
    expect(db!.historico.filter((e: { tipo: string }) => e.tipo === 'terminado')).toHaveLength(1);
    expect((await stock(s))!.stockDisponivel).toBe(9500);
    expect(
      await c()
        .db!.collection('orders')
        .countDocuments({ comprador: new Types.ObjectId(s.buyers[0]!.id) }),
    ).toBe(0);
  });
  it('libertação acima do teto fica pendente e é regularizada sem duplicação', async () => {
    const s = await subject(),
      a = await create(s).expect(201);
    const p = await createProductModel(c()).findById(s.body.produtoId).orFail();
    p.stockDisponivel = 10_000_000;
    await p.save();
    await expire(a.body.id);
    await service.advance(new Types.ObjectId(a.body.id));
    expect((await auction(a.body.id))!.reserva).toMatchObject({
      estado: 'libertacao_pendente',
      pendente: 500,
      reposta: 0,
    });
    const product = await createProductModel(c()).findById(s.body.produtoId).orFail();
    product.stockDisponivel = 9_999_600;
    await product.save();
    await service.advance(new Types.ObjectId(a.body.id));
    expect((await stock(s))!.stockDisponivel).toBe(10_000_000);
    expect((await auction(a.body.id))!.reserva).toMatchObject({ pendente: 100, reposta: 400 });
    await service.advance(new Types.ObjectId(a.body.id));
    expect((await auction(a.body.id))!.reserva).toMatchObject({ pendente: 100, reposta: 400 });
  });
  it('reserva disputa o último stock com checkout sem dupla venda', async () => {
    const s = await subject(),
      p = await createProductModel(c()).findById(s.body.produtoId).orFail();
    p.stockDisponivel = 500;
    await p.save();
    const current = (await stock(s))!;
    const order = createOrdersService(c(), { now: () => new Date('2026-10-26T08:00:00Z') });
    await order.prepare();
    const pedido = {
      ...s.scenario.pedido,
      linhas: s.scenario.pedido.linhas.map((line) => ({
        ...line,
        ofertaAceite: {
          ...line.ofertaAceite,
          revisaoProdutoObservada: current.revisaoOperacional!,
        },
      })),
    };
    const principal = s.buyers[0]!;
    const results = await Promise.all([create(s), order.checkout(principal, randomUUID(), pedido)]);
    const auctionCreated = (results[0] as request.Response).status === 201,
      orderCreated = 'status' in results[1] && results[1].status === 201;
    expect(Number(auctionCreated) + Number(orderCreated)).toBe(1);
    expect((await stock(s))!.stockDisponivel).toBe(0);
  });
  it('histórico autenticado paginado, pseudónimo e sem identidade privada', async () => {
    const s = await subject(),
      a = await create(s).expect(201);
    await offer(s, a.body.id, 30100, 0).expect(201);
    await offer(s, a.body.id, 30200, 1).expect(201);
    const r = await request(app)
      .get('/api/auctions/' + a.body.id + '/bids?ordem=antigas')
      .set('Authorization', 'Bearer ' + s.buyerTokens[0])
      .expect(200);
    expect(r.body.total).toBe(2);
    expect(r.body.itens.map((b: { sequencia: number }) => b.sequencia)).toEqual([1, 2]);
    expect(r.body.itens[0].participante.proprio).toBe(true);
    expect(r.body.itens[1].participante.proprio).toBe(false);
    for (const u of s.buyers) expect(JSON.stringify(r.body)).not.toContain(u.id);
    expect(JSON.stringify(r.body)).not.toMatch(/requestId|requestHash|email|password|telefone/);
  });
  it('remoção atual do papel ou inativação bloqueia token existente', async () => {
    for (const inactive of [false, true]) {
      const s = await subject(),
        a = await create(s).expect(201),
        u = await createUserModel(c()).findById(s.buyers[0]!.id).select('+passwordHash').orFail();
      if (inactive) u.ativo = false;
      else u.papeis = ['produtor'];
      await u.save();
      await offer(s, a.body.id).expect(inactive ? 401 : 403);
      expect((await auction(a.body.id))!.sequencia).toBe(0);
    }
  });
  it('recuperação após reinício ativa e encerra por datas persistidas', async () => {
    const s = await subject(),
      a = await create(s, {
        ...s.body,
        iniciaEm: new Date(Date.now() + 60000).toISOString(),
      }).expect(201);
    await c()
      .db!.collection('auctions')
      .updateOne(
        { _id: new Types.ObjectId(a.body.id) },
        { $set: { iniciaEm: new Date(Date.now() - 1000) } },
      );
    const recovered = createAuctionService(c(), config.secret);
    await recovered.recover();
    expect((await auction(a.body.id))!.estado).toBe('ativo');
    await expire(a.body.id);
    await recovered.recover();
    expect((await auction(a.body.id))!.estado).toBe('terminado');
  });
  it('duas criações com a mesma chave reservam stock uma única vez', async () => {
    const s = await subject(),
      k = randomUUID();
    const rs = await Promise.all([create(s, s.body, k), create(s, s.body, k)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(rs[0]!.body.id).toBe(rs[1]!.body.id);
    expect((await stock(s))!.stockDisponivel).toBe(9500);
  });
  it('falha ao inserir o leilão reverte a reserva física de stock', async () => {
    const s = await subject(),
      before = await stock(s),
      original = mongo.Collection.prototype.insertOne;
    const spy = vi.spyOn(mongo.Collection.prototype, 'insertOne').mockImplementation(function (
      this: mongo.Collection,
      ...args: Parameters<typeof original>
    ) {
      if (this.collectionName === 'auctions') throw Error('falha fictícia');
      return original.apply(this, args);
    } as typeof original);
    try {
      await create(s).expect(500);
    } finally {
      spy.mockRestore();
    }
    expect(await stock(s)).toEqual(before);
  });
  it('isolamento dos produtores, filtro por estado e identificador desconhecido', async () => {
    const s = await subject(),
      other = await subject();
    const a = await create(s).expect(201);
    await create(other).expect(201);
    const r = await request(app)
      .get('/api/me/producer/auctions?estado=ativo&porPagina=12')
      .set('Authorization', 'Bearer ' + s.sellerToken)
      .expect(200);
    expect(r.body.total).toBe(1);
    expect(r.body.itens[0].id).toBe(a.body.id);
    expect(r.body.itens[0].reserva).toMatchObject({ estado: 'reservada' });
    await request(app)
      .put('/api/auctions/' + a.body.id)
      .set('Authorization', 'Bearer ' + other.sellerToken)
      .set('If-Match', a.headers.etag!)
      .send({})
      .expect(400);
    await request(app)
      .post('/api/auctions/' + a.body.id + '/cancel')
      .set('Authorization', 'Bearer ' + other.sellerToken)
      .set('If-Match', a.headers.etag!)
      .send({})
      .expect(404);
    await read(s, new Types.ObjectId().toHexString()).expect(404);
  });
  it('exige If-Match atual e Idempotency-Key válida sem alterar dados', async () => {
    const s = await subject(),
      a = await create(s).expect(201),
      before = await auction(a.body.id);
    await request(app)
      .post('/api/auctions/' + a.body.id + '/cancel')
      .set('Authorization', 'Bearer ' + s.sellerToken)
      .send({})
      .expect(428);
    await request(app)
      .post('/api/auctions/' + a.body.id + '/cancel')
      .set('Authorization', 'Bearer ' + s.sellerToken)
      .set('If-Match', '*')
      .send({})
      .expect(400);
    await request(app)
      .post('/api/auctions/' + a.body.id + '/bids')
      .set('Authorization', 'Bearer ' + s.buyerTokens[0])
      .send({ valorCent: 30100 })
      .expect(400);
    expect(await auction(a.body.id)).toEqual(before);
  });
  it('mudança da unidade deixa reposição pendente sem converter stock', async () => {
    const s = await subject(),
      a = await create(s).expect(201);
    // Alteração administrativa fictícia fora do serviço, apenas na base isolada.
    await c()
      .db!.collection('products')
      .updateOne(
        { _id: new Types.ObjectId(s.body.produtoId) },
        { $set: { 'unidadeVenda.incrementoCompra': 100 } },
      );
    await expire(a.body.id);
    await service.advance(new Types.ObjectId(a.body.id));
    expect((await stock(s))!.stockDisponivel).toBe(9500);
    expect((await auction(a.body.id))!.reserva).toMatchObject({ pendente: 500, reposta: 0 });
  });
  it('retirada de capacidade entre leitura e escrita provoca rollback real', async () => {
    const s = await subject(),
      a = await create(s).expect(201),
      before = await auction(a.body.id);
    const original = mongo.Collection.prototype.findOneAndUpdate;
    let injected = false;
    const spy = vi
      .spyOn(mongo.Collection.prototype, 'findOneAndUpdate')
      .mockImplementation(async function (
        this: mongo.Collection,
        ...args: Parameters<typeof original>
      ) {
        if (
          !injected &&
          this.collectionName === 'users' &&
          String(args[0]._id) === s.buyers[0]!.id
        ) {
          injected = true;
          await c()
            .db!.collection('users')
            .updateOne(
              { _id: new Types.ObjectId(s.buyers[0]!.id) },
              { $set: { ativo: false }, $inc: { revisaoOperacional: 1 } },
            );
        }
        return original.apply(this, args);
      } as typeof original);
    try {
      await offer(s, a.body.id).expect(403);
    } finally {
      spy.mockRestore();
    }
    expect(injected).toBe(true);
    expect(await auction(a.body.id)).toEqual(before);
    expect(await c().db!.collection('bids').countDocuments({ leilao: before!._id })).toBe(0);
  });
  it('relógio MongoDB rejeita quando o prazo passa durante a preparação', async () => {
    const s = await subject(),
      a = await create(s).expect(201);
    const original = mongo.Collection.prototype.findOneAndUpdate;
    let injected = false;
    const spy = vi
      .spyOn(mongo.Collection.prototype, 'findOneAndUpdate')
      .mockImplementation(async function (
        this: mongo.Collection,
        ...args: Parameters<typeof original>
      ) {
        if (!injected && this.collectionName === 'auctions' && Array.isArray(args[1])) {
          injected = true;
          await expire(a.body.id);
        }
        return original.apply(this, args);
      } as typeof original);
    try {
      await offer(s, a.body.id).expect(409);
    } finally {
      spy.mockRestore();
    }
    expect((await auction(a.body.id))!.sequencia).toBe(0);
  });
  it('oferta elegível no MongoDB pode concluir commit depois do prazo', async () => {
    const s = await subject(),
      a = await create(s).expect(201),
      end = new Date(Date.now() + 3000);
    await c()
      .db!.collection('auctions')
      .updateOne({ _id: new Types.ObjectId(a.body.id) }, { $set: { terminaEm: end } });
    const original = mongo.Collection.prototype.insertOne;
    let delayed = false;
    const spy = vi
      .spyOn(mongo.Collection.prototype, 'insertOne')
      .mockImplementation(async function (
        this: mongo.Collection,
        ...args: Parameters<typeof original>
      ) {
        if (!delayed && this.collectionName === 'bids') {
          delayed = true;
          await new Promise((resolve) =>
            setTimeout(resolve, Math.max(1, end.getTime() - Date.now() + 100)),
          );
        }
        return original.apply(this, args);
      } as typeof original);
    let r: request.Response;
    try {
      r = await offer(s, a.body.id).expect(201);
    } finally {
      spy.mockRestore();
    }
    expect(delayed).toBe(true);
    expect(new Date(r.body.licitacao.aceiteEm).getTime()).toBeLessThan(end.getTime());
    expect(Date.now()).toBeGreaterThan(end.getTime());
    await service.advance(new Types.ObjectId(a.body.id));
    expect((await auction(a.body.id))!.resultado.valorCent).toBe(30100);
  });
  it('temporizador no backend encerra sem depender de um pedido do browser', async () => {
    const s = await subject(),
      a = await create(s).expect(201);
    await expire(a.body.id);
    const stop = service.startLifecycle();
    try {
      await vi.waitFor(async () => expect((await auction(a.body.id))!.estado).toBe('terminado'), {
        timeout: 5000,
        interval: 100,
      });
    } finally {
      await stop();
    }
    expect((await stock(s))!.stockDisponivel).toBe(10000);
  });
});
