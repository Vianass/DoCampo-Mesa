import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import request from 'supertest';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { connectDatabase } from '../../src/database/connection.js';
import { parseEnvironment } from '../../src/config/environment.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createOrdersService } from '../../src/modules/orders/orders.service.js';
import { createCheckoutPreparationService } from '../../src/modules/orders/checkout-preparation.service.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import { createProductModel } from '../../src/modules/products/product.model.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import { createOrderModel } from '../../src/modules/orders/order.model.js';
import { authConfiguration, authToken } from '../support/auth-fixtures.js';
import {
  checkoutScenario,
  checkoutTestNow,
  seedCheckoutScenario,
} from '../support/checkout-fixtures.js';
const config = authConfiguration();
let database: Awaited<ReturnType<typeof connectDatabase>>, app: ReturnType<typeof createApp>;
let now = Date.now();
const connection = () => database.connection;
beforeEach(() => {
  now = Date.now();
});
beforeAll(async () => {
  database = await connectDatabase(
    parseEnvironment({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      MONGODB_DB_NAME: 'docampo_test_' + randomUUID().replaceAll('-', ''),
    }),
  );
  expect((await connection().db!.admin().command({ hello: 1 })).setName).toBe('rs-dcm-test');
  const auth = createAuthService(connection(), config),
    orders = createOrdersService(connection(), { now: () => checkoutTestNow }),
    preparation = createCheckoutPreparationService(connection(), () => new Date(now));
  await auth.prepare();
  await orders.prepare();
  await preparation.prepare();
  for (const model of [createProducerModel(connection()), createProductModel(connection())]) {
    await model.createCollection();
    await model.createIndexes();
  }
  app = createApp({ auth, orders, preparation, security: config });
});
afterAll(async () => {
  if (!database) return;
  try {
    await connection().dropDatabase();
  } finally {
    await database.close();
  }
});
async function subject(count = 1, delivery = false) {
  const s = await seedCheckoutScenario(connection(), checkoutScenario(count, delivery));
  return { ...s, token: await authToken(config, s.buyerId.toHexString()) };
}
type Subject = Awaited<ReturnType<typeof subject>>;
function metadata(
  s: Subject,
  body: object = {
    itens: s.pedido.linhas.map((l) => ({ produtoId: l.produtoId, quantidade: l.quantidade })),
  },
) {
  return request(app)
    .post('/api/orders/prepare')
    .set('Authorization', 'Bearer ' + s.token)
    .send(body);
}
function checkpoint(s: Subject, ref = randomUUID(), body: unknown = s.pedido, key = s.chave) {
  return request(app)
    .post('/api/orders/attempts')
    .set('Authorization', 'Bearer ' + s.token)
    .set('Idempotency-Key', key)
    .send({ referencia: ref, pedido: body });
}
function recover(s: Subject, ref: string) {
  return request(app)
    .get('/api/orders/attempts/' + ref)
    .set('Authorization', 'Bearer ' + s.token);
}
function purchase(s: Subject, body = s.pedido, key = s.chave) {
  return request(app)
    .post('/api/orders')
    .set('Authorization', 'Bearer ' + s.token)
    .set('Idempotency-Key', key)
    .send(body);
}
async function unchanged(s: Subject) {
  return {
    orders: await createOrderModel(connection()).countDocuments({ comprador: s.buyerId }),
    stock: await connection()
      .db!.collection('products')
      .find({ _id: { $in: s.products.map((p) => p._id) } })
      .project({ _id: 1, stockDisponivel: 1, revisaoOperacional: 1 })
      .sort({ _id: 1 })
      .toArray(),
  };
}
describe('preparação e recuperação privadas reais', () => {
  it.each([1, 2])(
    'prepara %s produtores com referências e revisões atuais, sem reserva',
    async (count) => {
      const s = await subject(count),
        before = await unchanged(s),
        response = await metadata(s).expect(200);
      expect(response.body.linhas).toHaveLength(count);
      expect(response.body.produtores).toHaveLength(count);
      expect(response.body.linhas[0]).toMatchObject({
        produtoId: s.products[0]!._id.toHexString(),
        produtorContaId: s.products[0]!.produtor.toHexString(),
        ofertaAceite: { revisaoProdutoObservada: 0, precoReferenciaCent: 150 },
        subtotalCent: 75,
      });
      expect(response.body.produtores[0]).toMatchObject({
        perfilId: s.producers[0]!._id.toHexString(),
        produtorContaId: s.producers[0]!.userId.toHexString(),
        revisaoProdutorObservada: 0,
      });
      expect(await unchanged(s)).toEqual(before);
      expect(response.headers['cache-control']).toBe('no-store');
    },
  );
  it('metadados excluem telefone, decisor, contas bancárias e hashes', async () => {
    const s = await subject();
    const response = await metadata(s).expect(200),
      text = JSON.stringify(response.body);
    for (const key of [
      'passwordHash',
      'emailNormalizado',
      'telefone',
      'pagamentoPrivado',
      'iban',
      'decisao',
      'hashCanonico',
    ])
      expect(text).not.toContain('"' + key + '"');
    expect(response.body.produtores[0].comercial.localLevantamento).toBe(
      s.producers[0]!.comercial.localLevantamento,
    );
  });
  it.each(['revision', 'owner', 'extra', 'quantity'] as const)(
    'rejeita metadados arbitrários %s',
    async (kind) => {
      const s = await subject(),
        line = { produtoId: s.products[0]!._id.toHexString(), quantidade: 500 };
      const item =
        kind === 'quantity'
          ? { ...line, quantidade: 0 }
          : kind === 'revision'
            ? { ...line, revisaoProdutoObservada: 0 }
            : kind === 'owner'
              ? { ...line, produtorContaId: s.buyerId.toHexString() }
              : line;
      await metadata(
        s,
        kind === 'extra'
          ? { itens: [item], compradorContaId: s.buyerId.toHexString() }
          : { itens: [item] },
      ).expect(400);
    },
  );
  it.each(['stock', 'quantidade', 'inexistente', 'rascunho', 'inativo'] as const)(
    'recusa preparação incompatível: %s',
    async (kind) => {
      const s = await subject();
      let body = {
        itens: s.pedido.linhas.map((l) => ({ produtoId: l.produtoId, quantidade: l.quantidade })),
      };
      if (kind === 'stock' || kind === 'rascunho') {
        const p = await createProductModel(connection()).findById(s.products[0]!._id).orFail();
        if (kind === 'stock') p.stockDisponivel = 0;
        else p.estadoPublicacao = 'rascunho';
        await p.save();
      }
      if (kind === 'quantidade')
        body = { itens: [{ produtoId: s.products[0]!._id.toHexString(), quantidade: 1 }] };
      if (kind === 'inexistente')
        body = { itens: [{ produtoId: new Types.ObjectId().toHexString(), quantidade: 500 }] };
      if (kind === 'inativo') {
        const user = await createUserModel(connection())
          .findById(s.producers[0]!.userId)
          .select('+passwordHash')
          .orFail();
        user.ativo = false;
        await user.save();
      }
      await metadata(s, body).expect(409);
      expect((await unchanged(s)).orders).toBe(0);
    },
  );
  it.each(['/api/orders/prepare', '/api/orders/attempts'])(
    'sem JWT não aceita %s',
    async (path) => {
      await request(app).post(path).send({}).expect(401);
    },
  );
  it('papel sem capacidade compradora não prepara nem recupera', async () => {
    const s = await subject();
    const user = await createUserModel(connection())
      .findById(s.buyerId)
      .select('+passwordHash')
      .orFail();
    user.papeis = ['produtor'];
    await user.save();
    await metadata(s).expect(403);
    await checkpoint(s).expect(403);
    await recover(s, randomUUID()).expect(403);
  });
  it('checkpoint guarda o pedido somente no servidor e não executa a compra', async () => {
    const s = await subject(1, true),
      ref = randomUUID(),
      before = await unchanged(s),
      response = await checkpoint(s, ref).expect(200);
    expect(Object.keys(response.body).sort()).toEqual(['expiraEm', 'referencia']);
    expect(JSON.stringify(response.body)).not.toContain('Morada privada fictícia');
    const record = await connection()
      .db!.collection('checkout_attempts')
      .findOne({ _id: ref } as never);
    expect(record!.pedido.condicoesPorProdutor[0].morada).toBe('Morada privada fictícia');
    expect(record!.comprador.equals(s.buyerId)).toBe(true);
    expect(await unchanged(s)).toEqual(before);
    expect((await recover(s, ref).expect(200)).body).toMatchObject({
      referencia: ref,
      chaveIdempotencia: s.chave,
      pedido: s.pedido,
    });
  });
  it('referência imutável recusa conteúdo diferente e não renova o prazo', async () => {
    const s = await subject(),
      ref = randomUUID(),
      first = await checkpoint(s, ref).expect(200);
    now += 1000;
    expect((await checkpoint(s, ref).expect(200)).body).toEqual(first.body);
    await checkpoint(s, ref, {
      ...s.pedido,
      linhas: s.pedido.linhas.map((l) => ({ ...l, quantidade: 1000 })),
    }).expect(409);
    await checkpoint(s, ref, s.pedido, 'outra-chave-ficticia').expect(409);
    expect((await recover(s, ref).expect(200)).body.pedido).toEqual(s.pedido);
  });
  it('outra conta não consulta nem substitui a referência', async () => {
    const s = await subject(),
      other = await subject(),
      ref = randomUUID();
    await checkpoint(s, ref).expect(200);
    const third = await recover(other, ref).expect(404),
      missing = await recover(other, randomUUID()).expect(404);
    expect(third.body).toEqual(missing.body);
    await checkpoint(other, ref).expect(409);
    expect((await recover(s, ref).expect(200)).body.pedido).toEqual(s.pedido);
  });
  it('checkpoint concorrente não cria compras e conserva uma cópia exata', async () => {
    const s = await subject(),
      ref = randomUUID();
    await Promise.all([checkpoint(s, ref).expect(200), checkpoint(s, ref).expect(200)]);
    expect(
      await connection()
        .db!.collection('checkout_attempts')
        .countDocuments({ _id: ref } as never),
    ).toBe(1);
    expect((await unchanged(s)).orders).toBe(0);
  });
  it.each([undefined, 'com espaço', 'x'.repeat(129)])('valida a chave original %j', async (key) => {
    const s = await subject();
    let req = request(app)
      .post('/api/orders/attempts')
      .set('Authorization', 'Bearer ' + s.token);
    if (key !== undefined) req = req.set('Idempotency-Key', key);
    await req.send({ referencia: randomUUID(), pedido: s.pedido }).expect(400);
  });
  it('prazo técnico bloqueia recuperação expirada e tem índice TTL', async () => {
    const s = await subject(),
      ref = randomUUID();
    await checkpoint(s, ref).expect(200);
    now += 25 * 60 * 60 * 1000;
    await recover(s, ref).expect(410);
    const indexes = await connection().db!.collection('checkout_attempts').indexes();
    expect(indexes.some((i) => i.key.expiraEm === 1 && i.expireAfterSeconds === 0)).toBe(true);
  });
  it('recupera o payload original após resposta de compra perdida sem novo débito', async () => {
    const s = await subject(2),
      ref = randomUUID();
    await checkpoint(s, ref).expect(200);
    const first = await purchase(s).expect(201),
      before = await unchanged(s);
    const saved = (await recover(s, ref).expect(200)).body;
    const replay = await purchase(s, saved.pedido, saved.chaveIdempotencia).expect(200);
    expect(replay.body).toEqual({ ...first.body, origem: 'replay' });
    expect(await unchanged(s)).toEqual(before);
  });
  it('revisão manipulada não autoriza uma compra', async () => {
    const s = await subject(),
      ref = randomUUID();
    const body = {
      ...s.pedido,
      linhas: s.pedido.linhas.map((l) => ({
        ...l,
        ofertaAceite: { ...l.ofertaAceite, revisaoProdutoObservada: 1000 },
      })),
    };
    await checkpoint(s, ref, body).expect(200);
    await purchase(s, body).expect(409);
    expect((await unchanged(s)).orders).toBe(0);
  });
  it('preparação respeita o limite existente de dez produtores', async () => {
    const s = await subject(11);
    const response = await metadata(s).expect(400);
    expect(response.body.codigo).toBe('LIMITE_TECNICO_EXCEDIDO');
    expect((await unchanged(s)).orders).toBe(0);
  });
  it('não expõe local de levantamento quando a modalidade está desativada', async () => {
    const s = await subject();
    const p = await createProducerModel(connection())
      .findById(s.producers[0]!._id)
      .select('+telefone +aprovacao.decisao.autor +comercial.pagamentoPrivado')
      .orFail();
    p.set('comercial.modalidades.levantamento', false);
    await p.save();
    const response = await metadata(s).expect(200);
    expect(response.body.produtores[0].comercial).not.toHaveProperty('localLevantamento');
    expect(response.body.produtores[0].comercial.disponibilidade.levantamento).toEqual([]);
  });
});
