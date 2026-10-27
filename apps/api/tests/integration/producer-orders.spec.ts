import { randomUUID } from 'node:crypto';
import { Types, mongo } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { connectDatabase } from '../../src/database/connection.js';
import { parseEnvironment } from '../../src/config/environment.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createOrdersService } from '../../src/modules/orders/orders.service.js';
import { createProducerOrdersService } from '../../src/modules/orders/producer-orders.service.js';
import { createOrderModel } from '../../src/modules/orders/order.model.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import { orderStates } from '../../src/modules/orders/order.constants.js';
import { authConfiguration, authToken } from '../support/auth-fixtures.js';
import {
  checkoutScenario,
  checkoutTestNow,
  seedCheckoutScenario,
} from '../support/checkout-fixtures.js';
import { orderInput } from '../support/order-fixtures.js';

const config = authConfiguration();
let database: Awaited<ReturnType<typeof connectDatabase>>, app: ReturnType<typeof createApp>;
const c = () => database.connection;
beforeAll(async () => {
  database = await connectDatabase(
    parseEnvironment({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      MONGODB_DB_NAME: 'docampo_test_' + randomUUID().replaceAll('-', ''),
    }),
  );
  const auth = createAuthService(c(), config),
    orders = createOrdersService(c(), { now: () => checkoutTestNow }),
    producerOrders = createProducerOrdersService(c(), config.secret);
  await auth.prepare();
  await orders.prepare();
  app = createApp({ auth, orders, producerOrders, security: config });
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
async function subject(delivery = false) {
  const s = await seedCheckoutScenario(c(), checkoutScenario(2, delivery));
  const buyerToken = await authToken(config, s.buyerId.toHexString());
  const receipt = await request(app)
    .post('/api/orders')
    .set('Authorization', 'Bearer ' + buyerToken)
    .set('Idempotency-Key', s.chave)
    .send(s.pedido)
    .expect(201);
  const first = receipt.body.encomendas.find(
    (o: { produtorContaId: string }) => o.produtorContaId === s.producers[0]!.userId.toHexString(),
  );
  const second = receipt.body.encomendas.find(
    (o: { produtorContaId: string }) => o.produtorContaId === s.producers[1]!.userId.toHexString(),
  );
  return {
    ...s,
    buyerToken,
    token: await authToken(config, s.producers[0]!.userId.toHexString()),
    otherToken: await authToken(config, s.producers[1]!.userId.toHexString()),
    id: first.orderId as string,
    otherId: second.orderId as string,
  };
}
type Subject = Awaited<ReturnType<typeof subject>>;
const path = '/api/me/producer/orders';
const read = (s: Subject, id = s.id) =>
  request(app)
    .get(path + '/' + id)
    .set('Authorization', 'Bearer ' + s.token);
const list = (s: Subject, q = '') =>
  request(app)
    .get(path + q)
    .set('Authorization', 'Bearer ' + s.token);
const write = (s: Subject, state: string, tag?: string, id = s.id) => {
  const req = request(app)
    .patch(path + '/' + id + '/status')
    .set('Authorization', 'Bearer ' + s.token);
  if (tag !== undefined) req.set('If-Match', tag);
  return req.send({ estado: state });
};
const raw = (id: string) =>
  c()
    .db!.collection('orders')
    .findOne({ _id: new Types.ObjectId(id) });

describe('gestão real de encomendas pelo produtor', () => {
  it.each(['', '/id', '/id/status'])('JWT obrigatório em %s', async (suffix) => {
    const response = suffix.endsWith('status')
      ? request(app)
          .patch(path + suffix)
          .send({ estado: 'confirmada' })
      : request(app).get(path + suffix);
    await response.expect(401);
  });
  it('lista só a produção própria e calcula indicadores sem somar pendentes como vendas', async () => {
    const s = await subject(),
      r = await list(s).expect(200);
    expect(r.body.itens.map((o: { id: string }) => o.id)).toEqual([s.id]);
    expect(r.body.total).toBe(1);
    expect(r.body.indicadores).toMatchObject({
      numeroEncomendas: 1,
      valorConcluidasCent: 0,
      estadoVendas: 'concluida',
      porEstado: { pendente: 1, concluida: 0 },
    });
    expect(r.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(r.body)).not.toMatch(
      /emailNormalizado|passwordHash|hashCanonico|idempotencia|morada|contacto|comprador/,
    );
  });
  it.each([false, true])('detalhe minimizado e ETag forte, entrega=%s', async (delivery) => {
    const s = await subject(delivery),
      r = await read(s).expect(200);
    expect(r.headers.etag).toMatch(/^"[A-Za-z0-9_-]{43}"$/);
    expect(r.body.acoesPermitidas).toEqual(['confirmada']);
    expect(r.body.entrega.modalidade).toBe(delivery ? 'entrega' : 'levantamento');
    if (delivery) expect(r.body.entrega.morada).toBe('Morada privada fictícia');
    const text = JSON.stringify(r.body);
    for (const key of [
      'comprador',
      'email',
      'passwordHash',
      'hashCanonico',
      'idempotencia',
      'ator',
      'comandoId',
      'versao',
      'pedidosCancelamento',
    ])
      expect(text).not.toContain('"' + key + '"');
  });
  it.each(['terceiro', 'ausente'])('404 uniforme em detalhe e comando %s', async (kind) => {
    const s = await subject(),
      id = kind === 'terceiro' ? s.otherId : new Types.ObjectId().toHexString();
    const a = await read(s, id).expect(404),
      b = await write(s, 'confirmada', '"' + 'x'.repeat(43) + '"', id).expect(404);
    expect(a.body).toEqual(b.body);
    expect((await raw(s.otherId))!.estado).toBe('pendente');
  });
  it.each(['papel', 'inativa'])(
    'capacidades atuais recusam conta %s apesar do JWT antigo',
    async (kind) => {
      const s = await subject(),
        u = await createUserModel(c())
          .findById(s.producers[0]!.userId)
          .select('+passwordHash')
          .orFail();
      if (kind === 'papel') u.papeis = ['comprador'];
      else u.ativo = false;
      await u.save();
      await list(s).expect(kind === 'papel' ? 403 : 401);
      await write(s, 'confirmada', '"' + 'x'.repeat(43) + '"').expect(kind === 'papel' ? 403 : 401);
    },
  );
  it('comprador não recebe permissões de produtor', async () => {
    const s = await subject();
    await request(app)
      .get(path)
      .set('Authorization', 'Bearer ' + s.buyerToken)
      .expect(403);
  });
  it.each([
    '?produtorId=livre',
    '?estado=entregue',
    '?pagina=0',
    '?porPagina=100',
    '?estado=pendente&estado=pronta',
    '?ordem=livre',
  ])('query estrita %s', async (q) => {
    await list(await subject(), q).expect(400);
  });
  it('filtro/paginação ordenam por data e ID; indicadores independentes dos filtros', async () => {
    const s = await subject();
    for (let i = 0; i < 13; i++)
      await createOrderModel(c()).create(
        orderInput('concluida', { produtor: s.producers[0]!.userId, comprador: s.buyerId }),
      );
    const r = await list(s, '?estado=concluida&porPagina=12&pagina=2&ordem=antigas').expect(200);
    expect(r.body).toMatchObject({ total: 13, totalPaginas: 2, pagina: 2 });
    expect(r.body.itens).toHaveLength(1);
    expect(r.body.indicadores).toMatchObject({
      numeroEncomendas: 14,
      valorConcluidasCent: 975,
      porEstado: { concluida: 13, pendente: 1 },
    });
    const asc = await list(s, '?ordem=antigas').expect(200),
      desc = await list(s, '?ordem=recentes').expect(200);
    expect(asc.body.itens[0].id).not.toBe(desc.body.itens[0].id);
  });
  it('percurso permitido preserva snapshots, pagamento, recibo e stock e é visível ao comprador', async () => {
    const s = await subject(true),
      before = await raw(s.id),
      stock = await c().db!.collection('products').findOne({ _id: s.products[0]!._id });
    let tag = (await read(s).expect(200)).headers.etag;
    for (const state of ['confirmada', 'em_preparacao', 'pronta']) {
      const r = await write(s, state, tag).expect(200);
      expect(r.headers.etag).not.toBe(tag);
      tag = r.headers.etag;
      expect(r.body.estado).toBe(state);
      const buyer = await request(app)
        .get('/api/orders/' + s.id)
        .set('Authorization', 'Bearer ' + s.buyerToken)
        .expect(200);
      expect(buyer.body.estado).toBe(state);
    }
    const after = (await raw(s.id))!;
    for (const f of [
      'linhas',
      'entrega',
      'pagamento',
      'idempotencia',
      'comprador',
      'produtor',
      'operacaoCompraId',
      'totalCent',
      'subtotalProdutosCent',
    ])
      expect(after[f]).toEqual(before![f]);
    expect(after.versao).toBe(3);
    expect(after.historicoEstado).toHaveLength(before!.historicoEstado.length + 3);
    expect(after.historicoEstado.at(-1)).toMatchObject({
      de: 'em_preparacao',
      para: 'pronta',
      versaoObservada: 2,
      ator: { papelNaAcao: 'produtor', userId: s.producers[0]!.userId },
    });
    expect(
      (await c().db!.collection('products').findOne({ _id: s.products[0]!._id }))!.stockDisponivel,
    ).toBe(stock!.stockDisponivel);
    expect((await read(s)).body.acoesPermitidas).toEqual([]);
    const replay = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer ' + s.buyerToken)
      .set('Idempotency-Key', s.chave)
      .send(s.pedido)
      .expect(200);
    expect(
      replay.body.encomendas.find((o: { orderId: string }) => o.orderId === s.id).estadoInicial,
    ).toBe('pendente');
  });
  it.each(['pendente', 'em_preparacao', 'pronta', 'concluida', 'cancelada'])(
    'recusa salto/repetição inicial para %s',
    async (state) => {
      const s = await subject(),
        tag = (await read(s)).headers.etag;
      await write(s, state, tag).expect(409);
      expect((await raw(s.id))!.estado).toBe('pendente');
    },
  );
  it.each(['concluida', 'cancelada', 'pronta'] as const)(
    'estado %s não pode ser reaberto nem concluído pelo produtor',
    async (state) => {
      const s = await subject(),
        o = await createOrderModel(c()).create(
          orderInput(state, { produtor: s.producers[0]!.userId, comprador: s.buyerId }),
        );
      const r = await read(s, o._id.toHexString()).expect(200);
      expect(r.body.acoesPermitidas).toEqual([]);
      await write(s, 'confirmada', r.headers.etag, o._id.toHexString()).expect(409);
    },
  );
  it.each([undefined, '*', 'W/"' + 'x'.repeat(43) + '"', '"' + 'x'.repeat(43) + '"'])(
    'precondição obrigatória e forte %s',
    async (tag) => {
      const s = await subject();
      await write(s, 'confirmada', tag).expect(
        tag === undefined ? 428 : tag.startsWith('"') ? 412 : 400,
      );
    },
  );
  it.each([
    { estado: 'confirmada', produtorId: 'livre' },
    { estado: 'confirmada', pagamento: { estado: 'pago' } },
    { estado: 'confirmada', linhas: [] },
    { estado: 'entregue' },
  ])('mass assignment não modifica negócio: %j', async (body) => {
    const s = await subject(),
      tag = (await read(s)).headers.etag;
    await request(app)
      .patch(path + '/' + s.id + '/status')
      .set('Authorization', 'Bearer ' + s.token)
      .set('If-Match', tag!)
      .send(body)
      .expect(400);
    expect((await raw(s.id))!.estado).toBe('pendente');
  });
  it('dois comandos com o mesmo ETag só acrescentam uma transição', async () => {
    const s = await subject(),
      tag = (await read(s)).headers.etag;
    const rs = await Promise.all([write(s, 'confirmada', tag), write(s, 'confirmada', tag)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 412]);
    expect((await raw(s.id))!.historicoEstado).toHaveLength(2);
    await write(s, 'em_preparacao', tag).expect(412);
  });
  it('a guarda transacional impede remoção concorrente da capacidade', async () => {
    const s = await subject(),
      tag = (await read(s)).headers.etag,
      original = mongo.Collection.prototype.findOneAndUpdate;
    let changed = false;
    const spy = vi
      .spyOn(mongo.Collection.prototype, 'findOneAndUpdate')
      .mockImplementation(async function (
        this: mongo.Collection,
        ...args: Parameters<typeof original>
      ) {
        if (!changed && this.collectionName === 'users') {
          changed = true;
          const u = await createUserModel(c())
            .findById(s.producers[0]!.userId)
            .select('+passwordHash')
            .orFail();
          u.papeis = ['comprador'];
          await u.save();
        }
        return original.apply(this, args);
      } as typeof original);
    try {
      await write(s, 'confirmada', tag).expect(403);
    } finally {
      spy.mockRestore();
    }
    expect((await raw(s.id))!.estado).toBe('pendente');
    expect((await raw(s.id))!.historicoEstado).toHaveLength(1);
  });
  it('erros de base não expõem detalhes nem apresentam listas vazias', async () => {
    const s = await subject(),
      spy = vi.spyOn(mongo.Collection.prototype, 'aggregate').mockImplementation(() => {
        throw new mongo.MongoNetworkError('segredo-ficticio-interno');
      });
    try {
      const r = await list(s).expect(503);
      expect(r.body.codigo).toBe('SERVICO_INDISPONIVEL');
      expect(JSON.stringify(r.body)).not.toContain('segredo');
    } finally {
      spy.mockRestore();
    }
  });
  it('CORS aceita PATCH/If-Match só na origem autorizada', async () => {
    const r = await request(app)
      .options(path + '/' + new Types.ObjectId() + '/status')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'authorization,content-type,if-match')
      .expect(204);
    expect(r.headers['access-control-allow-methods']).toContain('PATCH');
    await request(app)
      .options(path)
      .set('Origin', 'https://alheio.invalid')
      .set('Access-Control-Request-Method', 'PATCH')
      .expect(403);
  });
  it.each(orderStates)('filtro reconhece o estado existente %s', async (state) => {
    const r = await list(await subject(), '?estado=' + state).expect(200);
    expect(r.body.itens.every((o: { estado: string }) => o.estado === state)).toBe(true);
  });
});
