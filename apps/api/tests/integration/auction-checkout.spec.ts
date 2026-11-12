import { randomUUID } from 'node:crypto';
import { Types, createConnection } from 'mongoose';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { connectDatabase } from '../../src/database/connection.js';
import { parseEnvironment } from '../../src/config/environment.js';
import { createApp } from '../../src/app.js';
import { createAuctionService } from '../../src/modules/auctions/auction.service.js';
import { createOrdersService } from '../../src/modules/orders/orders.service.js';
import { createProducerOrdersService } from '../../src/modules/orders/producer-orders.service.js';
import { createOrderNotificationsService } from '../../src/modules/orders/order-notifications.service.js';
import { createOrderReceiptService } from '../../src/modules/orders/order-receipt.service.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { validateCheckoutInput } from '../../src/modules/orders/checkout.validation.js';
import { createOrderModel } from '../../src/modules/orders/order.model.js';
import { authConfiguration, authToken } from '../support/auth-fixtures.js';
import { seedAuctionActors } from '../support/auction-fixtures.js';

let db: Awaited<ReturnType<typeof connectDatabase>>;
let auctions: ReturnType<typeof createAuctionService>;
const config = authConfiguration(),
  c = () => db.connection;
beforeAll(async () => {
  db = await connectDatabase(
    parseEnvironment({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      MONGODB_DB_NAME: 'docampo_test_' + randomUUID().replaceAll('-', ''),
    }),
  );
  auctions = createAuctionService(c(), config.secret);
  await auctions.prepare();
});
afterAll(async () => {
  if (db) {
    await c().dropDatabase();
    await db.close();
  }
});
async function scenario(winner = true, end = true, winningPrice = 30100) {
  const actors = await seedAuctionActors(c());
  const created = await auctions.create(actors.seller, actors.body, randomUUID()),
    id = created.body.id;
  if (winner) await auctions.bid(actors.buyers[0]!, id, { valorCent: winningPrice }, randomUUID());
  if (end) {
    await c()
      .db!.collection('auctions')
      .updateOne(
        { _id: new Types.ObjectId(id) },
        { $set: { iniciaEm: new Date(Date.now() - 5000), terminaEm: new Date(Date.now() - 1000) } },
      );
    await auctions.advance(new Types.ObjectId(id));
  }
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + ((8 - date.getUTCDay()) % 7 || 7));
  date.setUTCHours(10, 0, 0, 0);
  const profile = await c()
    .db!.collection('producers')
    .findOne({ userId: new Types.ObjectId(actors.seller.id) });
  const body = {
    condicao: {
      produtorContaId: actors.seller.id,
      modalidade: 'levantamento',
      periodo: {
        inicioEm: date.toISOString(),
        fimEm: new Date(date.getTime() + 3600000).toISOString(),
        fusoHorario: 'Europe/Lisbon',
      },
      metodoPagamento: 'dinheiro',
      taxaEntregaAceiteCent: 0,
      revisaoProdutorObservada: profile!.revisaoOperacional,
    },
  };
  return { ...actors, id, buyer: actors.buyers[0]!, body, key: randomUUID() };
}
describe('formalização de lotes — MongoDB real', () => {
  it.each([1_000_001, Number.MAX_SAFE_INTEGER])(
    'preserva o valor vencedor %i sem aplicar o teto unitário do catálogo',
    async (value) => {
      const s = await scenario(true, true, value);
      const meta = await auctions.checkoutMetadata(s.buyer, s.id);
      expect(() =>
        validateCheckoutInput({ compradorContaId: s.buyer.id }, s.key, {
          linhas: meta.preparacao.linhas.map(
            ({ produtoId, produtorContaId, quantidade, ofertaAceite }) => ({
              produtoId,
              produtorContaId,
              quantidade,
              ofertaAceite,
            }),
          ),
          condicoesPorProdutor: [s.body.condicao],
        }),
      ).toThrow();
      const created = await auctions.checkout(s.buyer, s.id, s.body, s.key);
      expect(created.status).toBe(201);
      expect(created.body.totalCent).toBe(value);
      const saved = await createOrderModel(c())
        .findById(created.body.encomendas[0]!.orderId)
        .orFail();
      expect(saved.linhas[0]!.precoReferenciaCent).toBe(value);
      await expect(saved.validate()).resolves.toBeUndefined();
      const replay = await auctions.checkout(s.buyer, s.id, s.body, s.key);
      expect(replay.status).toBe(200);
      expect(replay.body.totalCent).toBe(value);
      expect(replay.body.encomendas[0]!.orderId).toBe(created.body.encomendas[0]!.orderId);
    },
  );

  it('não cria compra no encerramento; só prepara para o vencedor sem divulgar dados privados', async () => {
    const s = await scenario();
    expect(
      await c()
        .db!.collection('orders')
        .countDocuments({ leilaoOrigem: new Types.ObjectId(s.id) }),
    ).toBe(0);
    const meta = await auctions.checkoutMetadata(s.buyer, s.id);
    expect(meta.preparacao.linhas[0]).toMatchObject({ quantidade: 1, subtotalCent: 30100 });
    expect(meta.preparacao.linhas[0]!.ofertaAceite.unidadeVenda.conteudoPorUnidade).toEqual({
      quantidade: 500,
      unidade: 'g',
    });
    expect(JSON.stringify(meta)).not.toMatch(/passwordHash|pagamentoPrivado|compradorContaId/);
    await expect(auctions.checkoutMetadata(s.buyers[1]!, s.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(auctions.checkoutMetadata(s.seller, s.id)).rejects.toMatchObject({ status: 403 });
  });
  it('cria uma encomenda normal de lote e consome a reserva sem novo débito; recupera após reinício', async () => {
    const s = await scenario(),
      result = await auctions.checkout(s.buyer, s.id, s.body, s.key);
    expect(result.status).toBe(201);
    expect(result.body.totalCent).toBe(30100);
    const id = result.body.encomendas[0]!.orderId;
    const order = await c()
      .db!.collection('orders')
      .findOne({ _id: new Types.ObjectId(id) });
    expect(order).toMatchObject({
      comprador: new Types.ObjectId(s.buyer.id),
      produtor: new Types.ObjectId(s.seller.id),
      leilaoOrigem: new Types.ObjectId(s.id),
      estado: 'pendente',
      totalCent: 30100,
    });
    expect(order!.linhas[0]).toMatchObject({
      quantidade: 1,
      precoReferenciaCent: 30100,
      subtotalCent: 30100,
    });
    expect(
      (await c().db!.collection('products').findOne({ _id: s.scenario.products[0]!._id }))!
        .stockDisponivel,
    ).toBe(9500);
    expect(
      await c()
        .db!.collection('auctions')
        .findOne({ _id: new Types.ObjectId(s.id) }),
    ).toMatchObject({
      estado: 'terminado',
      reserva: { estado: 'consumida' },
      resultado: { comprador: new Types.ObjectId(s.buyer.id), valorCent: 30100 },
    });
    const restarted = createAuctionService(c(), config.secret);
    const replay = await restarted.checkout(s.buyer, s.id, s.body, s.key);
    expect(replay.status).toBe(200);
    expect(replay.body.encomendas).toEqual(result.body.encomendas);
    expect(
      await c()
        .db!.collection('orders')
        .countDocuments({ leilaoOrigem: new Types.ObjectId(s.id) }),
    ).toBe(1);
    const buyerOrders = createOrdersService(c());
    expect((await buyerOrders.detail(s.buyer, id)).leilaoOrigemId).toBe(s.id);
    const producer = createProducerOrdersService(c(), config.secret);
    for (const state of ['confirmada', 'em_preparacao', 'pronta'] as const) {
      const detail = await producer.detail(s.seller, id);
      await producer.status(s.seller, id, state, detail.etag);
    }
    const detail = await producer.detail(s.seller, id);
    expect(detail.body.leilaoOrigemId).toBe(s.id);
    expect(detail.body.estado).toBe('pronta');
    expect(
      (await createOrderNotificationsService(c()).versions(s.buyer)).some(
        (o) => o.encomendaId === id && o.estado === 'pronta',
      ),
    ).toBe(true);
    const receipt = createOrderReceiptService(c(), config.secret);
    const own = await c()
      .db!.collection('orders')
      .findOne({ _id: new Types.ObjectId(id) });
    const completed = await receipt.confirm(
      s.buyer,
      id,
      receipt.etag(s.buyer, { id, versao: own!.versao }),
    );
    expect(completed.body.estado).toBe('concluida');
  });
  it('duas confirmações concorrentes da mesma chave convergem numa única encomenda', async () => {
    const s = await scenario();
    const results = await Promise.all([
      auctions.checkout(s.buyer, s.id, s.body, s.key),
      auctions.checkout(s.buyer, s.id, s.body, s.key),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(results[0]!.body.encomendas).toEqual(results[1]!.body.encomendas);
  });
  it('chaves diferentes concorrentes não vendem duas vezes o lote', async () => {
    const s = await scenario();
    const results = await Promise.allSettled([
      auctions.checkout(s.buyer, s.id, s.body, s.key),
      auctions.checkout(s.buyer, s.id, s.body, randomUUID()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await c()
        .db!.collection('orders')
        .countDocuments({ leilaoOrigem: new Types.ObjectId(s.id) }),
    ).toBe(1);
  });
  it.each(['precoCent', 'quantidade', 'produtoId', 'produtorId', 'compradorId'])(
    'rejeita manipulação do campo %s',
    async (field) => {
      const s = await scenario();
      await expect(
        auctions.checkout(s.buyer, s.id, { ...s.body, [field]: 'intruso' }, s.key),
      ).rejects.toMatchObject({ status: 400 });
      expect(
        await c()
          .db!.collection('orders')
          .countDocuments({ leilaoOrigem: new Types.ObjectId(s.id) }),
      ).toBe(0);
    },
  );
  it('recusa terceiro, leilão ativo, ausência de ofertas e conta suspensa', async () => {
    const s = await scenario();
    await expect(auctions.checkout(s.buyers[1]!, s.id, s.body, s.key)).rejects.toMatchObject({
      status: 404,
    });
    const active = await scenario(true, false),
      empty = await scenario(false);
    await expect(
      auctions.checkout(active.buyer, active.id, active.body, active.key),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      auctions.checkout(empty.buyer, empty.id, empty.body, empty.key),
    ).rejects.toMatchObject({ status: 404 });
    await c()
      .db!.collection('users')
      .updateOne({ _id: new Types.ObjectId(s.buyer.id) }, { $set: { ativo: false } });
    await expect(auctions.checkout(s.buyer, s.id, s.body, s.key)).rejects.toMatchObject({
      status: 403,
    });
  });
  it.each(['periodo', 'metodoPagamento', 'taxaEntregaAceiteCent', 'produtorContaId'])(
    'recusa seleção comercial inválida: %s',
    async (field) => {
      const s = await scenario();
      await expect(
        auctions.checkout(
          s.buyer,
          s.id,
          {
            condicao: {
              ...s.body.condicao,
              [field]: field === 'taxaEntregaAceiteCent' ? 100 : 'invalido',
            },
          },
          s.key,
        ),
      ).rejects.toBeDefined();
      expect(
        await c()
          .db!.collection('orders')
          .countDocuments({ leilaoOrigem: new Types.ObjectId(s.id) }),
      ).toBe(0);
    },
  );
  it('falha após guardar a encomenda faz rollback da encomenda e da reserva', async () => {
    const s = await scenario();
    const collection = c().db!.collection('auctions');
    const prototype = Object.getPrototypeOf(collection) as typeof collection;
    const original = prototype.updateOne;
    const fail = vi.spyOn(prototype, 'updateOne').mockImplementation(function (
      this: typeof collection,
      ...args: Parameters<typeof collection.updateOne>
    ) {
      if (
        this.collectionName === 'auctions' &&
        JSON.stringify(args[1]).includes('compra_confirmada')
      )
        return Promise.reject(new Error('falha fictícia de commit lógico'));
      return original.apply(this, args);
    });
    try {
      await expect(auctions.checkout(s.buyer, s.id, s.body, s.key)).rejects.toThrow(
        'falha fictícia',
      );
    } finally {
      fail.mockRestore();
    }
    expect(
      await c()
        .db!.collection('orders')
        .countDocuments({ leilaoOrigem: new Types.ObjectId(s.id) }),
    ).toBe(0);
    expect(
      (await c()
        .db!.collection('auctions')
        .findOne({ _id: new Types.ObjectId(s.id) }))!.reserva.estado,
    ).toBe('afeta_vencedor');
    expect((await auctions.checkout(s.buyer, s.id, s.body, s.key)).status).toBe(201);
  });
  it('HTTP exige JWT e mantém códigos 201/200, Location e DTO minimizado', async () => {
    const s = await scenario(),
      auth = createAuthService(c(), config);
    await auth.prepare();
    const app = createApp({
      auth,
      auctions,
      security: config,
      auctionLimits: { ipLimit: 100000, accountLimit: 100000 },
    });
    const token = await authToken(config, s.buyer.id);
    await request(app)
      .get('/api/auctions/' + s.id + '/checkout')
      .expect(401);
    const created = await request(app)
      .post('/api/auctions/' + s.id + '/checkout')
      .set('Authorization', 'Bearer ' + token)
      .set('Idempotency-Key', s.key)
      .send(s.body)
      .expect(201);
    expect(created.headers.location).toContain('/api/orders/');
    await request(app)
      .post('/api/auctions/' + s.id + '/checkout')
      .set('Authorization', 'Bearer ' + token)
      .set('Idempotency-Key', s.key)
      .send(s.body)
      .expect(200);
    expect(JSON.stringify(created.body)).not.toMatch(/passwordHash|hashCanonico|compradorId/);
  });
  it('entrega aplica apenas a tarifa configurada e conserva morada no snapshot privado', async () => {
    const s = await scenario();
    s.body.condicao.modalidade = 'entrega';
    const date = new Date(s.body.condicao.periodo.inicioEm);
    date.setUTCHours(14);
    const body = {
      condicao: {
        ...s.body.condicao,
        taxaEntregaAceiteCent: 250,
        concelhoId: 'concelho-ficticio-001',
        morada: 'Morada fictícia',
        contacto: 'Contacto fictício',
        periodo: {
          ...s.body.condicao.periodo,
          inicioEm: date.toISOString(),
          fimEm: new Date(date.getTime() + 3600000).toISOString(),
        },
      },
    };
    const result = await auctions.checkout(s.buyer, s.id, body, s.key);
    expect(result.body.totalCent).toBe(30350);
    const order = await c()
      .db!.collection('orders')
      .findOne({ leilaoOrigem: new Types.ObjectId(s.id) });
    expect(order!.entrega.snapshot).toMatchObject({
      taxaEntregaCent: 250,
      morada: 'Morada fictícia',
      tipo: 'entrega',
    });
    expect(JSON.stringify((await auctions.detail(s.seller, s.id)).body)).not.toContain(
      'Morada fictícia',
    );
  });
  it('carrinho normal pode comprar apenas stock livre; o lote reservado formaliza mesmo com stock livre zero', async () => {
    const s = await scenario();
    const product = await c()
      .db!.collection('products')
      .findOne({ _id: s.scenario.products[0]!._id });
    const normal = createOrdersService(c());
    const result = await normal.checkout(s.buyer, randomUUID(), {
      linhas: [
        {
          produtoId: product!._id.toHexString(),
          produtorContaId: s.seller.id,
          quantidade: 9500,
          ofertaAceite: {
            precoReferenciaCent: product!.precoCent,
            revisaoProdutoObservada: product!.revisaoOperacional,
            unidadeVenda: product!.unidadeVenda,
          },
        },
      ],
      condicoesPorProdutor: [s.body.condicao],
    });
    expect(result.status).toBe(201);
    const meta = await auctions.checkoutMetadata(s.buyer, s.id);
    s.body.condicao.revisaoProdutorObservada =
      meta.preparacao.produtores[0]!.revisaoProdutorObservada;
    expect((await auctions.checkout(s.buyer, s.id, s.body, s.key)).status).toBe(201);
    expect(
      (await c().db!.collection('products').findOne({ _id: product!._id }))!.stockDisponivel,
    ).toBe(0);
  });
  it('recupera numa ligação nova, com modelos e serviço recriados; impede alterar a origem persistida', async () => {
    const s = await scenario(),
      created = await auctions.checkout(s.buyer, s.id, s.body, s.key);
    const fresh = await createConnection(
      'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      { dbName: c().name },
    ).asPromise();
    try {
      const service = createAuctionService(fresh, config.secret);
      await service.prepare();
      expect((await service.checkout(s.buyer, s.id, s.body, s.key)).body.encomendas).toEqual(
        created.body.encomendas,
      );
      const doc = await createOrderModel(fresh)
        .findById(created.body.encomendas[0]!.orderId)
        .orFail();
      doc.set('leilaoOrigem', new Types.ObjectId());
      await expect(doc.validate()).rejects.toMatchObject({
        errors: { leilaoOrigem: expect.anything() },
      });
    } finally {
      await fresh.close();
    }
  });
  it('moderação do produto bloqueia nova formalização sem libertar ou revender o lote', async () => {
    const s = await scenario();
    await c()
      .db!.collection('products')
      .updateOne({ _id: s.scenario.products[0]!._id }, { $set: { 'moderacao.estado': 'oculta' } });
    await expect(auctions.checkoutMetadata(s.buyer, s.id)).rejects.toMatchObject({ status: 409 });
    await expect(auctions.checkout(s.buyer, s.id, s.body, s.key)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      await c()
        .db!.collection('orders')
        .countDocuments({ leilaoOrigem: new Types.ObjectId(s.id) }),
    ).toBe(0);
    expect(
      (await c()
        .db!.collection('auctions')
        .findOne({ _id: new Types.ObjectId(s.id) }))!.reserva.estado,
    ).toBe('afeta_vencedor');
  });
});
