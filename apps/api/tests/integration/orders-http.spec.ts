import { randomUUID } from 'node:crypto';
import { Types, mongo } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { startApi } from '../../src/runtime.js';
import { connectDatabase } from '../../src/database/connection.js';
import { parseEnvironment } from '../../src/config/environment.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createOrdersService } from '../../src/modules/orders/orders.service.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import { createProductModel } from '../../src/modules/products/product.model.js';
import { createOrderModel } from '../../src/modules/orders/order.model.js';
import {
  checkoutScenario,
  checkoutTestNow,
  seedCheckoutScenario,
} from '../support/checkout-fixtures.js';
import { authConfiguration, authToken, registrationInput } from '../support/auth-fixtures.js';
import { userInput } from '../support/identity-fixtures.js';

const configuration = parseEnvironment({
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
  MONGODB_DB_NAME: 'docampo_test_' + randomUUID().replaceAll('-', ''),
});
const security = authConfiguration();
let database: Awaited<ReturnType<typeof connectDatabase>>;
let service: ReturnType<typeof createOrdersService>;
let auth: ReturnType<typeof createAuthService>;
let app: ReturnType<typeof createApp>;
const connection = () => database.connection;
beforeAll(async () => {
  database = await connectDatabase(configuration);
  expect((await connection().db!.admin().command({ hello: 1 })).setName).toBe('rs-dcm-test');
  auth = createAuthService(connection(), security);
  await auth.prepare();
  for (const model of [createProducerModel(connection()), createProductModel(connection())]) {
    await model.createCollection();
    await model.createIndexes();
  }
  service = createOrdersService(connection(), { now: () => checkoutTestNow });
  await service.prepare();
  app = createApp({
    auth,
    orders: service,
    security,
    rateLimit: { ipLimit: 1000, accountLimit: 1000 },
  });
});
afterAll(async () => {
  if (!database) return;
  try {
    await connection().dropDatabase();
  } finally {
    await database.close();
  }
});
type Scenario = ReturnType<typeof checkoutScenario>;
async function subject(count = 1, delivery = false) {
  return seedCheckoutScenario(connection(), checkoutScenario(count, delivery));
}
async function token(id: Types.ObjectId) {
  return authToken(security, id.toHexString());
}
async function buy(
  s: Scenario,
  body: object = s.pedido,
  key = s.chave,
  status: number | null = 201,
) {
  const response = await request(app)
    .post('/api/orders')
    .set('Authorization', 'Bearer ' + (await token(s.buyerId)))
    .set('Idempotency-Key', key)
    .send(body);
  if (status !== null) expect(response.status).toBe(status);
  return response;
}
async function detail(s: Scenario, id: string, status = 200) {
  return request(app)
    .get('/api/orders/' + id)
    .set('Authorization', 'Bearer ' + (await token(s.buyerId)))
    .expect(status);
}
async function list(s: Scenario, query = '', status = 200) {
  return request(app)
    .get('/api/orders' + query)
    .set('Authorization', 'Bearer ' + (await token(s.buyerId)))
    .expect(status);
}
async function state(s: Scenario) {
  return {
    orders: await connection()
      .db!.collection('orders')
      .find({ comprador: s.buyerId })
      .sort({ _id: 1 })
      .toArray(),
    products: await connection()
      .db!.collection('products')
      .find({ _id: { $in: s.products.map((p) => p._id) } })
      .sort({ _id: 1 })
      .toArray(),
    producers: await connection()
      .db!.collection('producers')
      .find({ userId: { $in: s.producers.map((p) => p.userId) } })
      .sort({ _id: 1 })
      .toArray(),
    users: await connection()
      .db!.collection('users')
      .find({ _id: { $in: [s.buyerId, ...s.producers.map((p) => p.userId)] } })
      .sort({ _id: 1 })
      .toArray(),
  };
}
async function buyerAccount(s: Scenario) {
  return createUserModel(connection()).findById(s.buyerId).select('+passwordHash').orFail();
}

describe('checkout HTTP com JWT e transações MongoDB reais', () => {
  it('registo e login reais fornecem a única identidade usada na compra', async () => {
    const input = registrationInput();
    await request(app).post('/api/auth/register').send(input).expect(202);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: input.email, password: input.password })
      .expect(200);
    const s = await subject();
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer ' + login.body.accessToken)
      .set('Idempotency-Key', s.chave)
      .send(s.pedido)
      .expect(201);
    const order = await createOrderModel(connection())
      .findById(response.body.encomendas[0].orderId)
      .lean();
    expect(order!.comprador.toHexString()).toBe(login.body.utilizador.id);
    expect(order!.comprador.equals(s.buyerId)).toBe(false);
  });
  it.each([1, 2])('cria grupo atómico de %s produtores com totais em cêntimos', async (count) => {
    const s = await subject(count);
    const response = await buy(s);
    expect(response.body).toMatchObject({ origem: 'nova', totalCent: 75 * count, moeda: 'EUR' });
    expect(response.body.encomendas).toHaveLength(count);
    const persisted = await state(s);
    expect(persisted.orders).toHaveLength(count);
    for (const p of persisted.products) expect(p.stockDisponivel).toBe(9500);
    for (const order of persisted.orders) {
      expect(order.operacaoCompraId).toBe(response.body.operacaoCompraId);
      expect(order.estado).toBe('pendente');
      expect(order.pagamento.estado).toBe('por_pagar');
      expect(order.totalCent).toBe(75);
    }
    expect(response.headers.location).toBe('/api/orders/' + response.body.encomendas[0].orderId);
    expect(response.headers['cache-control']).toBe('no-store');
    const text = JSON.stringify(response.body);
    for (const key of ['comprador', 'hashCanonico', 'idempotencia', 'morada', 'passwordHash'])
      expect(text).not.toContain('"' + key + '"');
  });
  it('entrega aplica taxa uma vez e revela a morada própria apenas no detalhe', async () => {
    const s = await subject(1, true);
    const response = await buy(s);
    expect(response.body.totalCent).toBe(325);
    const own = await detail(s, response.body.encomendas[0].orderId);
    expect(own.body).toMatchObject({
      totalCent: 325,
      taxaEntregaCent: 250,
      pagamento: { metodo: 'dinheiro', estado: 'por_pagar' },
      entrega: {
        modalidade: 'entrega',
        morada: 'Morada privada fictícia',
        contacto: 'Contacto privado fictício',
      },
      historicoEstado: [{ tipo: 'criacao_compra', para: 'pendente' }],
    });
    expect(JSON.stringify((await list(s)).body)).not.toContain('Morada privada fictícia');
  });
  it.each(['mb_way', 'transferencia_bancaria'] as const)(
    'regista método %s sem processar pagamento',
    async (method) => {
      const s = await subject();
      const body = {
        ...s.pedido,
        condicoesPorProdutor: s.pedido.condicoesPorProdutor.map((c) => ({
          ...c,
          metodoPagamento: method,
        })),
      };
      const response = await buy(s, body);
      expect((await detail(s, response.body.encomendas[0].orderId)).body.pagamento).toEqual({
        metodo: method,
        estado: 'por_pagar',
      });
    },
  );
  it('snapshots e recibo recuperado não usam nomes, preços ou locais atuais', async () => {
    const s = await subject();
    const first = await buy(s);
    const id = first.body.encomendas[0].orderId;
    const before = (await detail(s, id)).body;
    const product = await createProductModel(connection()).findById(s.products[0]!._id).orFail();
    product.nome = 'Novo nome atual';
    product.precoCent = 300;
    await product.save();
    const producer = await createProducerModel(connection())
      .findById(s.producers[0]!._id)
      .select('+telefone +aprovacao.decisao.autor +comercial.pagamentoPrivado')
      .orFail();
    producer.set('comercial.localLevantamento', 'Outro local oficial');
    await producer.save();
    expect((await detail(s, id)).body).toEqual(before);
    expect((await buy(s, s.pedido, s.chave, 200)).body).toEqual({
      ...first.body,
      origem: 'replay',
    });
    expect((await state(s)).products[0]!.stockDisponivel).toBe(9500);
  });
  it.each(['buyerId', 'compradorContaId', 'totalCent', 'contexto', 'papel'])(
    'rejeita mass assignment %s',
    async (field) => {
      const s = await subject();
      await buy(s, { ...s.pedido, [field]: 'valor-injetado' }, s.chave, 400);
      expect((await state(s)).orders).toHaveLength(0);
    },
  );
  it.each([undefined, '', 'com espaço', 'x'.repeat(129)])(
    'chave inválida é recusada: %j',
    async (key) => {
      const s = await subject();
      let req = request(app)
        .post('/api/orders')
        .set('Authorization', 'Bearer ' + (await token(s.buyerId)));
      if (key !== undefined) req = req.set('Idempotency-Key', key);
      await req.send(s.pedido).expect(400);
      expect((await state(s)).orders).toHaveLength(0);
    },
  );
  it.each(['sem-token', 'invalido', 'expirado', 'inativa', 'sem-capacidade'] as const)(
    'nega acesso com %s',
    async (kind) => {
      const s = await subject();
      let access: string | undefined = await token(s.buyerId);
      if (kind === 'sem-token') access = undefined;
      if (kind === 'invalido')
        access = await authToken(authConfiguration(), s.buyerId.toHexString());
      if (kind === 'expirado')
        access = await authToken(security, s.buyerId.toHexString(), {
          iat: Math.floor(Date.now() / 1000) - 1200,
          exp: Math.floor(Date.now() / 1000) - 1,
        });
      if (kind === 'inativa' || kind === 'sem-capacidade') {
        const user = await buyerAccount(s);
        if (kind === 'inativa') user.ativo = false;
        else user.papeis = ['administrador'];
        await user.save();
      }
      const status = kind === 'sem-capacidade' ? 403 : 401;
      for (const method of ['post', 'get'] as const) {
        let req = request(app)[method]('/api/orders');
        if (access) req = req.set('Authorization', 'Bearer ' + access);
        if (method === 'post') req = req.set('Idempotency-Key', s.chave).send(s.pedido);
        await req.expect(status);
      }
      expect((await state(s)).orders).toHaveLength(0);
    },
  );
  it.each([
    'inexistente',
    'arquivado',
    'stock',
    'preco',
    'revisao',
    'produtor',
    'taxa',
    'periodo',
    'local',
    'metodo',
  ] as const)('condição comercial %s recusa integralmente sem HTTP 500', async (kind) => {
    const s = await subject(2);
    let body = structuredClone(s.pedido);
    if (kind === 'inexistente')
      body = {
        ...body,
        linhas: body.linhas.map((l, i) =>
          i === 0 ? { ...l, produtoId: new Types.ObjectId().toHexString() } : l,
        ),
      };
    if (['arquivado', 'stock', 'preco', 'revisao'].includes(kind)) {
      const product = await createProductModel(connection()).findById(s.products[0]!._id).orFail();
      if (kind === 'arquivado') product.estadoPublicacao = 'arquivado';
      if (kind === 'stock') product.stockDisponivel = 0;
      if (kind === 'preco') product.precoCent = 200;
      if (kind === 'revisao') product.descricao = 'Alteração aprovada posterior';
      await product.save();
    }
    if (kind === 'produtor') {
      const producer = await createProducerModel(connection())
        .findById(s.producers[0]!._id)
        .select('+telefone +aprovacao.decisao.autor +comercial.pagamentoPrivado')
        .orFail();
      producer.set('aprovacao.estado', 'rejeitado');
      producer.set('aprovacao.decisao.justificacao', 'Motivo fictício de rejeição');
      await producer.save();
    }
    if (kind === 'local') {
      const producer = await createProducerModel(connection())
        .findById(s.producers[0]!._id)
        .select('+telefone +aprovacao.decisao.autor +comercial.pagamentoPrivado')
        .orFail();
      producer.set('comercial.localLevantamento', undefined);
      await producer.save();
    }
    if (kind === 'taxa')
      body = {
        ...body,
        condicoesPorProdutor: body.condicoesPorProdutor.map((c, i) =>
          i === 0
            ? {
                ...c,
                modalidade: 'entrega',
                concelhoId: 'concelho-ficticio-001',
                morada: 'Morada fictícia',
                contacto: 'Contacto fictício',
                taxaEntregaAceiteCent: 300,
              }
            : c,
        ),
      };
    if (kind === 'periodo')
      body = {
        ...body,
        condicoesPorProdutor: body.condicoesPorProdutor.map((c) => ({
          ...c,
          periodo: {
            ...c.periodo,
            inicioEm: '2026-10-26T23:00:00.000Z',
            fimEm: '2026-10-26T23:30:00.000Z',
          },
        })),
      };
    if (kind === 'metodo') {
      const producer = await createProducerModel(connection())
        .findById(s.producers[0]!._id)
        .select('+telefone +aprovacao.decisao.autor +comercial.pagamentoPrivado')
        .orFail();
      producer.set('comercial.metodosPagamento', ['dinheiro']);
      await producer.save();
      body = {
        ...body,
        condicoesPorProdutor: body.condicoesPorProdutor.map((c) => ({
          ...c,
          metodoPagamento: 'mb_way',
        })),
      };
    }
    const before = await state(s);
    await buy(s, body, s.chave, 409);
    expect(await state(s)).toEqual(before);
  });
  it('mesma chave e pedido recupera uma compra sem novo débito', async () => {
    const s = await subject(2),
      first = await buy(s),
      before = await state(s);
    expect((await buy(s, s.pedido, s.chave, 200)).body).toEqual({
      ...first.body,
      origem: 'replay',
    });
    expect(await state(s)).toEqual(before);
  });
  it('chave global não permite payload diferente nem recuperar recibo de outra conta', async () => {
    const s = await subject();
    await buy(s);
    const before = await state(s);
    await buy(
      s,
      { ...s.pedido, linhas: s.pedido.linhas.map((l) => ({ ...l, quantidade: 1000 })) },
      s.chave,
      409,
    );
    const other = await subject();
    const failed = await buy(other, other.pedido, s.chave, 409);
    expect(failed.body.codigo).toBe('CONFLITO_IDEMPOTENCIA');
    expect(failed.body).not.toHaveProperty('recibo');
    expect(await state(s)).toEqual(before);
    expect((await state(other)).orders).toHaveLength(0);
  });
  it('duas chamadas HTTP simultâneas com a mesma chave têm um único efeito', async () => {
    const s = await subject(2);
    const access = await token(s.buyerId);
    const send = () =>
      request(app)
        .post('/api/orders')
        .set('Authorization', 'Bearer ' + access)
        .set('Idempotency-Key', s.chave)
        .send(s.pedido);
    const responses = await Promise.all([send(), send()]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(responses[0]!.body.operacaoCompraId).toBe(responses[1]!.body.operacaoCompraId);
    expect((await state(s)).orders).toHaveLength(2);
    for (const p of (await state(s)).products) expect(p.stockDisponivel).toBe(9500);
  });
  it('dois compradores disputam o último stock sem venda duplicada', async () => {
    const s = checkoutScenario();
    s.products[0]!.stockDisponivel = 500;
    await seedCheckoutScenario(connection(), s);
    const other = { ...s, buyerId: new Types.ObjectId(), chave: 'outra-' + randomUUID() };
    await createUserModel(connection()).create(
      userInput({
        _id: other.buyerId,
        emailNormalizado: randomUUID() + '@example.invalid',
        papeis: ['comprador'],
      }),
    );
    const responses = await Promise.all([
      buy(s, s.pedido, s.chave, null),
      buy(other, other.pedido, other.chave, null),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await state(s)).products[0]!.stockDisponivel).toBe(0);
    expect(
      await createOrderModel(connection()).countDocuments({ produtor: s.producers[0]!.userId }),
    ).toBe(1);
  });
  it('falha ao guardar a última encomenda reverte stock e guardas e devolve erro seguro', async () => {
    const s = await subject(2),
      before = await state(s);
    const insert = mongo.Collection.prototype.insertOne;
    vi.spyOn(mongo.Collection.prototype, 'insertOne').mockImplementation(async function (
      this: mongo.Collection,
      ...args
    ) {
      if (this.collectionName === 'orders' && !args[0].idempotencia)
        throw Error('Falha privada injetada');
      return insert.apply(this, args);
    });
    const failed = await buy(s, s.pedido, s.chave, 500);
    expect(failed.body).toEqual({
      codigo: 'ERRO_INTERNO',
      mensagem: 'Não foi possível concluir o pedido.',
    });
    expect(await state(s)).toEqual(before);
  });
  it('commit real com resposta perdida recupera recibo e repetição HTTP não duplica', async () => {
    const s = await subject(2);
    const commit = mongo.ClientSession.prototype.commitTransaction;
    let injected = false;
    let wrote = false;
    const insert = mongo.Collection.prototype.insertOne;
    vi.spyOn(mongo.Collection.prototype, 'insertOne').mockImplementation(async function (
      this: mongo.Collection,
      ...args
    ) {
      const result = await insert.apply(this, args);
      if (this.collectionName === 'orders') wrote = true;
      return result;
    });
    vi.spyOn(mongo.ClientSession.prototype, 'commitTransaction').mockImplementation(async function (
      this: mongo.ClientSession,
      ...args
    ) {
      await commit.apply(this, args);
      if (wrote && !injected) {
        injected = true;
        throw new mongo.MongoNetworkError('Resposta fictícia perdida');
      }
    });
    const first = await buy(s, s.pedido, s.chave, 200);
    expect(injected).toBe(true);
    const before = await state(s);
    expect((await buy(s, s.pedido, s.chave, 200)).body).toEqual(first.body);
    expect(await state(s)).toEqual(before);
    expect(before.orders).toHaveLength(2);
  });
  it('consulta apenas encomendas próprias com paginação e cronologia determinísticas', async () => {
    const s = await subject();
    const ids: string[] = [];
    for (let i = 0; i < 13; i++) {
      const body = {
        ...s.pedido,
        linhas: s.pedido.linhas.map((l) => ({
          ...l,
          ofertaAceite: { ...l.ofertaAceite, revisaoProdutoObservada: i },
        })),
        condicoesPorProdutor: s.pedido.condicoesPorProdutor.map((c) => ({
          ...c,
          revisaoProdutorObservada: i,
        })),
      };
      ids.push((await buy(s, body, s.chave + '-' + i)).body.encomendas[0].orderId);
    }
    const first = await list(s),
      second = await list(s, '?pagina=2');
    expect(first.body).toMatchObject({ total: 13, totalPaginas: 2, pagina: 1, porPagina: 12 });
    expect(first.body.itens).toHaveLength(12);
    expect(second.body.itens).toHaveLength(1);
    expect(first.body.itens.map((i: { id: string }) => i.id)).toEqual(
      [...ids].sort().reverse().slice(0, 12),
    );
    expect((await list(s, '?ordem=antigas')).body.itens[0].id).toBe([...ids].sort()[0]);
    expect((await list(s, '?pagina=1000')).body.itens).toEqual([]);
    const other = await subject();
    expect((await list(other)).body.total).toBe(0);
    const missing = await detail(other, new Types.ObjectId().toHexString(), 404);
    expect((await detail(other, ids[0]!, 404)).body).toEqual(missing.body);
    expect((await detail(s, ids[0]!)).body.id).toBe(ids[0]);
  });
  it('perda da capacidade compradora bloqueia inclusive replay e leitura', async () => {
    const s = await subject();
    const first = await buy(s);
    const user = await buyerAccount(s);
    user.papeis = ['produtor'];
    await user.save();
    await buy(s, s.pedido, s.chave, 403);
    await list(s, '', 403);
    await detail(s, first.body.encomendas[0].orderId, 403);
  });
  it('mudança de capacidades depois da autenticação aborta a compra inteira', async () => {
    const s = await subject(2);
    const find = mongo.Collection.prototype.findOne;
    let changed = false;
    vi.spyOn(mongo.Collection.prototype, 'findOne').mockImplementation(async function (
      this: mongo.Collection,
      ...args
    ) {
      const result = await find.apply(this, args);
      if (!changed && this.collectionName === 'products' && args[1]?.session) {
        changed = true;
        const user = await buyerAccount(s);
        user.papeis = ['administrador'];
        await user.save();
      }
      return result;
    });
    await buy(s, s.pedido, s.chave, 403);
    expect(changed).toBe(true);
    const persisted = await state(s);
    expect(persisted.orders).toHaveLength(0);
    for (const product of persisted.products) expect(product.stockDisponivel).toBe(10000);
  });
  it('conflitos transitórios esgotados devolvem 503 e a mesma tentativa pode ser recuperada', async () => {
    const s = await subject();
    const before = await state(s);
    const find = mongo.Collection.prototype.findOne;
    vi.spyOn(mongo.Collection.prototype, 'findOne').mockImplementation(async function (
      this: mongo.Collection,
      ...args
    ) {
      const result = await find.apply(this, args);
      if (this.collectionName === 'products' && args[1]?.session)
        throw new mongo.MongoServerError({ code: 112, errorLabels: ['TransientTransactionError'] });
      return result;
    });
    const uncertain = await buy(s, s.pedido, s.chave, 503);
    expect(uncertain.body).toMatchObject({
      codigo: 'RESULTADO_DESCONHECIDO',
      repetirComMesmaChave: true,
    });
    expect(await state(s)).toEqual(before);
    vi.restoreAllMocks();
    const success = await buy(s);
    expect((await buy(s, s.pedido, s.chave, 200)).body).toEqual({
      ...success.body,
      origem: 'replay',
    });
  });
  it('indisponibilidade de leitura não se torna uma lista vazia ou erro interno', async () => {
    const s = await subject();
    vi.spyOn(mongo.Collection.prototype, 'aggregate').mockImplementation(() => {
      throw new mongo.MongoNetworkError('Falha fictícia privada');
    });
    const response = await list(s, '', 503);
    expect(response.body).toEqual({
      codigo: 'SERVICO_INDISPONIVEL',
      mensagem: 'Não foi possível consultar as encomendas.',
    });
  });
  it('quantidade do carrinho em g conserva a referência por kg e o arredondamento half-up', async () => {
    const s = await subject();
    const body = {
      ...s.pedido,
      linhas: s.pedido.linhas.map((line) => ({ ...line, quantidade: 250 })),
    };
    const response = await buy(s, body);
    expect(response.body.totalCent).toBe(38);
    const item = (await detail(s, response.body.encomendas[0].orderId)).body.linhas[0];
    expect(item).toMatchObject({
      quantidade: 250,
      precoReferenciaCent: 150,
      subtotalCent: 38,
      unidadeVenda: { unidadeBase: 'g', quantidadeReferencia: 1000 },
    });
  });
  it('runtime prepara o índice e expõe a rota real antes de aceitar tráfego', async () => {
    const runtime = await startApi(
      { ...configuration, port: 0 },
      { connect: async () => ({ connection: connection(), close: async () => undefined }) },
      security,
    );
    try {
      const s = await subject();
      await request(runtime.server)
        .get('/api/orders')
        .set('Authorization', 'Bearer ' + (await token(s.buyerId)))
        .expect(200);
      expect(
        (await connection().db!.collection('orders').indexes()).some(
          (i) => i.unique && i.key['idempotencia.chave'] === 1,
        ),
      ).toBe(true);
    } finally {
      await runtime.close();
    }
  });
});
