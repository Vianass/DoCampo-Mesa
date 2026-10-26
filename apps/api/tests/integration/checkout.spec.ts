import { randomUUID } from 'node:crypto';
import { Types, mongo } from 'mongoose';
import type { Model } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseEnvironment } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/database/connection.js';
import { createCheckoutService } from '../../src/modules/orders/checkout.service.js';
import type { CheckoutDependencies } from '../../src/modules/orders/checkout.service.js';
import { createOrderModel } from '../../src/modules/orders/order.model.js';
import type { OrderRecord } from '../../src/modules/orders/order.types.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import { createProductModel } from '../../src/modules/products/product.model.js';
import {
  checkoutScenario,
  checkoutTestNow,
  seedCheckoutScenario,
} from '../support/checkout-fixtures.js';
import { userInput } from '../support/identity-fixtures.js';

const configuration = parseEnvironment({
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
  MONGODB_DB_NAME: 'docampo_test_' + randomUUID().replaceAll('-', ''),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: '2000',
});
let database: Awaited<ReturnType<typeof connectDatabase>> | undefined;
let Order: Model<OrderRecord>;
function connection() {
  if (!database) throw new Error('Test database missing');
  return database.connection;
}
beforeAll(async () => {
  database = await connectDatabase(configuration);
  expect((await connection().db!.admin().command({ hello: 1 })).setName).toBe('rs-dcm-test');
  expect((await connection().db!.admin().command({ buildInfo: 1 })).version).toBe('8.0.34');
  Order = createOrderModel(connection());
  for (const model of [
    createUserModel(connection()),
    createProducerModel(connection()),
    createProductModel(connection()),
    Order,
  ]) {
    await model.createCollection();
    await model.createIndexes();
  }
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
function service(scenario: Scenario, options: Partial<CheckoutDependencies> = {}) {
  return createCheckoutService({
    connection: connection(),
    now: () => checkoutTestNow,
    resolveIdentity: async () => ({ compradorContaId: scenario.buyerId.toHexString() }),
    ...options,
  });
}
async function subject(count = 1, delivery = false) {
  return seedCheckoutScenario(connection(), checkoutScenario(count, delivery));
}
async function state(scenario: Scenario) {
  const db = connection().db!;
  return {
    orders: await db
      .collection('orders')
      .find({ comprador: scenario.buyerId })
      .sort({ _id: 1 })
      .toArray(),
    products: await db
      .collection('products')
      .find({ _id: { $in: scenario.products.map((p) => p._id) } })
      .sort({ _id: 1 })
      .toArray(),
    producers: await db
      .collection('producers')
      .find({ userId: { $in: scenario.producers.map((p) => p.userId) } })
      .sort({ _id: 1 })
      .toArray(),
    users: await db
      .collection('users')
      .find({ _id: { $in: [scenario.buyerId, ...scenario.producers.map((p) => p.userId)] } })
      .sort({ _id: 1 })
      .toArray(),
  };
}
async function internalProducer(scenario: Scenario) {
  return createProducerModel(connection())
    .findById(scenario.producers[0]!._id)
    .select('+telefone +aprovacao.decisao.autor +comercial.pagamentoPrivado')
    .orFail();
}
/** Barreira após uma leitura real do snapshot; a alteração externa confirma antes da continuação. */
function interleave(collectionName: string, operation: () => Promise<void>) {
  const original = mongo.Collection.prototype.findOne;
  let armed = true;
  return vi.spyOn(mongo.Collection.prototype, 'findOne').mockImplementation(async function (
    this: mongo.Collection,
    ...args
  ) {
    const result = await original.apply(this, args);
    if (armed && this.collectionName === collectionName && args[1]?.session) {
      armed = false;
      await operation();
    }
    return result;
  });
}

describe('checkout integral e snapshots', () => {
  it('vários produtos do mesmo produtor usam half-up por linha e uma taxa única', async () => {
    const scenario = await subject(1, true);
    const extra = { ...scenario.products[0]!, _id: new Types.ObjectId() };
    scenario.products.push(extra);
    await createProductModel(connection()).create(extra);
    const first = scenario.pedido.linhas[0]!;
    scenario.pedido = {
      ...scenario.pedido,
      linhas: [
        { ...first, quantidade: 250 },
        { ...first, produtoId: extra._id.toHexString() },
      ],
    };
    expect(await service(scenario)(scenario.chave, scenario.pedido)).toMatchObject({
      tipo: 'sucesso',
      recibo: { totalCent: 363 },
    });
    const persisted = await state(scenario);
    expect(persisted.orders).toHaveLength(1);
    expect(persisted.orders[0]).toMatchObject({
      subtotalProdutosCent: 113,
      taxaEntregaCent: 250,
      totalCent: 363,
    });
    expect(
      persisted.orders[0]!.linhas.map((l: { subtotalCent: number }) => l.subtotalCent).sort(),
    ).toEqual([38, 75]);
  });
  it('a mesma conta pode comprar à sua atividade produtora sem duplicar a guarda de conta', async () => {
    const scenario = await subject();
    scenario.buyerId = scenario.producers[0]!.userId;
    const account = await createUserModel(connection())
      .findById(scenario.buyerId)
      .select('+passwordHash')
      .orFail();
    account.papeis = ['comprador', 'produtor'];
    await account.save();
    expect((await service(scenario)(scenario.chave, scenario.pedido)).tipo).toBe('sucesso');
    expect(
      (await createUserModel(connection()).findById(scenario.buyerId).orFail()).revisaoOperacional,
    ).toBe(2);
  });
  it.each([1, 2])(
    'confirma %s produtores com todos os débitos e uma única âncora',
    async (count) => {
      const scenario = await subject(count);
      const result = await service(scenario)(scenario.chave, scenario.pedido);
      expect(result).toMatchObject({
        tipo: 'sucesso',
        origem: 'nova',
        recibo: { totalCent: 75 * count },
      });
      const persisted = await state(scenario);
      expect(persisted.orders).toHaveLength(count);
      expect(persisted.orders.filter((o) => o.idempotencia)).toHaveLength(1);
      expect(new Set(persisted.orders.map((o) => o.operacaoCompraId)).size).toBe(1);
      for (const product of persisted.products)
        expect(product).toMatchObject({ stockDisponivel: 9500, revisaoOperacional: 1 });
      for (const profile of persisted.producers) expect(profile.revisaoOperacional).toBe(1);
      for (const account of persisted.users) expect(account.revisaoOperacional).toBe(1);
      for (const order of persisted.orders) {
        expect(order.estado).toBe('pendente');
        expect(order.pagamento.estado).toBe('por_pagar');
        expect(order.entrega.snapshot.versaoConfiguracao).toBe(0);
        expect(order.linhas[0].versaoUnidade).toBe(0);
        expect(order.rececao).toMatchObject({
          decorridoMs: 0,
          ultimoInicioEm: null,
          limiteAtualEm: null,
        });
      }
    },
  );
  it('cobra uma taxa por produtor, agrega fragmentos e preserva dados de entrega apenas nas orders', async () => {
    const scenario = await subject(2, true);
    const first = scenario.pedido.linhas[0]!;
    scenario.pedido = {
      ...scenario.pedido,
      linhas: [
        { ...first, quantidade: 250 },
        ...scenario.pedido.linhas.slice(1),
        { ...first, quantidade: 250 },
      ],
    };
    const result = await service(scenario)(scenario.chave, scenario.pedido);
    expect(result).toMatchObject({ tipo: 'sucesso', recibo: { totalCent: 650 } });
    const persisted = await state(scenario);
    for (const order of persisted.orders) {
      expect(order.linhas).toHaveLength(1);
      expect(order).toMatchObject({
        subtotalProdutosCent: 75,
        taxaEntregaCent: 250,
        totalCent: 325,
      });
      expect(order.entrega.snapshot).toMatchObject({
        tipo: 'entrega',
        morada: 'Morada privada fictícia',
      });
    }
    for (const secret of [
      scenario.chave,
      'morada',
      'contacto',
      'pagamentoPrivado',
      'hashCanonico',
      'passwordHash',
    ])
      expect(JSON.stringify(result)).not.toContain(secret);
  });
  it.each(['dinheiro', 'mb_way', 'transferencia_bancaria'] as const)(
    'aceita método configurado %s sem processar pagamentos',
    async (method) => {
      const scenario = await subject();
      scenario.pedido = {
        ...scenario.pedido,
        condicoesPorProdutor: scenario.pedido.condicoesPorProdutor.map((s) => ({
          ...s,
          metodoPagamento: method,
        })),
      };
      expect((await service(scenario)(scenario.chave, scenario.pedido)).tipo).toBe('sucesso');
      expect((await state(scenario)).orders[0]!.pagamento).toMatchObject({
        metodo: method,
        estado: 'por_pagar',
      });
    },
  );
  it('copia o local oficial e preserva snapshots após alterações posteriores', async () => {
    const scenario = await subject();
    const run = service(scenario);
    const first = await run(scenario.chave, scenario.pedido);
    const before = (await state(scenario)).orders;
    const product = await createProductModel(connection())
      .findById(scenario.products[0]!._id)
      .orFail();
    product.nome = 'Outro nome';
    product.precoCent = 200;
    await product.save();
    const producer = await internalProducer(scenario);
    producer.set('comercial.localLevantamento', 'Outro local oficial');
    await producer.save();
    const replay = await run(scenario.chave, scenario.pedido);
    expect(replay).toEqual({ ...first, origem: 'replay' });
    expect((await state(scenario)).orders).toEqual(before);
    expect(before[0]!.entrega.snapshot.localLevantamento).toBe(
      scenario.producers[0]!.comercial.localLevantamento,
    );
  });
});

describe('reconfirmação e compatibilidade', () => {
  it('levantamento num perfil antigo sem local oficial não gera encomendas', async () => {
    const scenario = checkoutScenario();
    const { localLevantamento: unused, ...legacy } = scenario.producers[0]!.comercial;
    void unused;
    scenario.producers[0]!.comercial = legacy;
    await seedCheckoutScenario(connection(), scenario);
    const before = await state(scenario);
    expect((await service(scenario)(scenario.chave, scenario.pedido)).tipo).toBe(
      'reconfirmacao_necessaria',
    );
    expect(await state(scenario)).toEqual(before);
  });
  it('a substituição comercial a partir de leitura sem local oficial fica bloqueada', async () => {
    const scenario = await subject();
    const partial = await createProducerModel(connection())
      .findById(scenario.producers[0]!._id)
      .select(
        '+telefone +aprovacao.decisao.autor +comercial.pagamentoPrivado -comercial.localLevantamento',
      )
      .orFail();
    partial.set('comercial.taxaEntregaCent', 300);
    await expect(partial.save()).rejects.toThrow('leitura completa');
    expect((await internalProducer(scenario)).comercial!.localLevantamento).toBe(
      scenario.producers[0]!.comercial.localLevantamento,
    );
  });
  const changes = [
    'preco',
    'unidade',
    'quantidade',
    'stock',
    'produto',
    'aprovacao',
    'taxa',
    'concelho',
    'horario',
    'metodo',
    'revisao',
    'local',
  ] as const;
  it.each(changes)('recusa a compra integral sem escritas após alteração de %s', async (change) => {
    const scenario = await subject(2, true);
    const Product = createProductModel(connection());
    const product = await Product.findById(scenario.products[0]!._id).orFail();
    const producer = await internalProducer(scenario);
    if (change === 'preco') {
      product.precoCent = 200;
      await product.save();
    }
    if (change === 'unidade') {
      product.set('unidadeVenda.quantidadeMinima', 1000);
      await product.save();
    }
    if (change === 'quantidade')
      scenario.pedido = {
        ...scenario.pedido,
        linhas: scenario.pedido.linhas.map((l) => ({ ...l, quantidade: 600 })),
      };
    if (change === 'quantidade') {
      product.set('unidadeVenda.incrementoCompra', 250);
      await product.save();
    }
    if (change === 'stock') {
      product.stockDisponivel = 250;
      await product.save();
    }
    if (change === 'produto') {
      product.estadoPublicacao = 'arquivado';
      await product.save();
    }
    if (change === 'aprovacao') {
      producer.set('aprovacao', { estado: 'pendente', submetidaEm: checkoutTestNow });
      await producer.save();
    }
    if (change === 'taxa') {
      producer.set('comercial.taxaEntregaCent', 251);
      await producer.save();
    }
    if (change === 'concelho') {
      producer.set('comercial.concelhosEntregaIds', ['concelho-ficticio-002']);
      await producer.save();
    }
    if (change === 'horario') {
      producer.set('comercial.disponibilidade.entrega', [
        { diaSemana: 2, inicio: '14:00', fim: '18:00' },
      ]);
      await producer.save();
    }
    if (change === 'metodo') {
      producer.set('comercial.metodosPagamento', ['mb_way']);
      await producer.save();
    }
    if (change === 'revisao') {
      product.nome = 'Conteúdo alterado';
      await product.save();
    }
    if (change === 'local') {
      scenario.pedido = {
        ...scenario.pedido,
        condicoesPorProdutor: scenario.pedido.condicoesPorProdutor.map((s) => ({
          produtorContaId: s.produtorContaId,
          modalidade: 'levantamento',
          periodo: {
            ...s.periodo,
            inicioEm: '2026-10-26T09:00:00.000Z',
            fimEm: '2026-10-26T10:00:00.000Z',
          },
          metodoPagamento: 'dinheiro',
          taxaEntregaAceiteCent: 0,
          revisaoProdutorObservada: 0,
        })),
      };
      producer.set('comercial.localLevantamento', undefined);
      await producer.save();
    }
    const before = await state(scenario);
    expect((await service(scenario)(scenario.chave, scenario.pedido)).tipo).toBe(
      'reconfirmacao_necessaria',
    );
    expect(await state(scenario)).toEqual(before);
  });
  it('configuração antiga sem local aceita entrega, mas não inventa levantamento', async () => {
    const scenario = checkoutScenario(1, true);
    const { localLevantamento: unused, ...legacy } = scenario.producers[0]!.comercial;
    void unused;
    scenario.producers[0]!.comercial = legacy;
    await seedCheckoutScenario(connection(), scenario);
    expect((await service(scenario)(scenario.chave, scenario.pedido)).tipo).toBe('sucesso');
  });
  it('documentos antigos sem revisão participam no protocolo sem migração prévia', async () => {
    const scenario = await subject();
    for (const [name, ids] of [
      ['users', [scenario.buyerId, scenario.producers[0]!.userId]],
      ['producers', [scenario.producers[0]!._id]],
      ['products', [scenario.products[0]!._id]],
    ] as const)
      await connection()
        .db!.collection(name)
        .updateMany({ _id: { $in: [...ids] } }, { $unset: { revisaoOperacional: '' } });
    expect((await service(scenario)(scenario.chave, scenario.pedido)).tipo).toBe('sucesso');
    const persisted = await state(scenario);
    for (const row of [...persisted.users, ...persisted.products, ...persisted.producers])
      expect(row.revisaoOperacional).toBe(1);
  });
  it.each(['comprador', 'produtor'] as const)(
    'conta sem capacidade %s aborta inclusive a âncora',
    async (role) => {
      const scenario = await subject();
      const id = role === 'comprador' ? scenario.buyerId : scenario.producers[0]!.userId;
      const account = await createUserModel(connection())
        .findById(id)
        .select('+passwordHash')
        .orFail();
      account.papeis = ['administrador'];
      await account.save();
      const before = await state(scenario);
      expect((await service(scenario)(scenario.chave, scenario.pedido)).tipo).toBe('recusado');
      expect(await state(scenario)).toEqual(before);
    },
  );
});

describe('idempotência da compra funcional', () => {
  it('payloads concorrentes diferentes da mesma conta disputam a chave sem combinar grupos', async () => {
    const first = await subject();
    const second = await subject();
    second.buyerId = first.buyerId;
    second.chave = first.chave;
    const results = await Promise.all([
      service(first)(first.chave, first.pedido),
      service(second)(second.chave, second.pedido),
    ]);
    expect(results.filter((r) => r.tipo === 'sucesso')).toHaveLength(1);
    expect(results.find((r) => r.tipo === 'recusado')).toMatchObject({
      tipo: 'recusado',
      erro: { codigo: 'CONFLITO_IDEMPOTENCIA' },
    });
    expect(await Order.countDocuments({ comprador: first.buyerId })).toBe(1);
    const productStates = [...(await state(first)).products, ...(await state(second)).products];
    expect(productStates.map((p) => p.stockDisponivel).sort()).toEqual([10_000, 9500]);
  });
  it('replay não volta a debitar stock nem a executar guardas', async () => {
    const scenario = await subject(2);
    const run = service(scenario);
    const first = await run(scenario.chave, scenario.pedido);
    const before = await state(scenario);
    expect(await run(scenario.chave, scenario.pedido)).toEqual({ ...first, origem: 'replay' });
    expect(await state(scenario)).toEqual(before);
  });
  it('recusa conteúdo diferente com a mesma chave sem novas escritas', async () => {
    const scenario = await subject();
    const run = service(scenario);
    await run(scenario.chave, scenario.pedido);
    const before = await state(scenario);
    const changed = {
      ...scenario.pedido,
      linhas: scenario.pedido.linhas.map((l) => ({ ...l, quantidade: 1000 })),
    };
    expect(await run(scenario.chave, changed)).toMatchObject({
      tipo: 'recusado',
      erro: { codigo: 'CONFLITO_IDEMPOTENCIA' },
    });
    expect(await state(scenario)).toEqual(before);
  });
  it('mesma chave concorrente cria um grupo e um débito por produto', async () => {
    const scenario = await subject(2);
    const run = service(scenario);
    const results = await Promise.all([
      run(scenario.chave, scenario.pedido),
      run(scenario.chave, scenario.pedido),
    ]);
    expect(results.every((r) => r.tipo === 'sucesso')).toBe(true);
    expect(results.filter((r) => r.tipo === 'sucesso' && r.origem === 'nova')).toHaveLength(1);
    if (results[0]!.tipo !== 'sucesso' || results[1]!.tipo !== 'sucesso')
      throw Error('Expected successes');
    expect(results[0]!.recibo).toEqual(results[1]!.recibo);
    const persisted = await state(scenario);
    expect(persisted.orders).toHaveLength(2);
    for (const p of persisted.products) expect(p.stockDisponivel).toBe(9500);
  });
  it('chave global protege compradores/produtores disjuntos e não revela recibo alheio', async () => {
    const first = await subject();
    const second = await subject();
    second.chave = first.chave;
    const results = await Promise.all([
      service(first)(first.chave, first.pedido),
      service(second)(second.chave, second.pedido),
    ]);
    expect(results.filter((r) => r.tipo === 'sucesso')).toHaveLength(1);
    const loser = results[0]!.tipo === 'sucesso' ? second : first;
    const refused = results.find((r) => r.tipo !== 'sucesso');
    expect(refused).toMatchObject({ tipo: 'recusado', erro: { codigo: 'CONFLITO_IDEMPOTENCIA' } });
    expect(JSON.stringify(refused)).not.toContain('recibo');
    expect((await state(loser)).products[0]!.stockDisponivel).toBe(10_000);
    expect((await state(loser)).orders).toHaveLength(0);
  });
});

describe('rollback e concorrência com escritores reais', () => {
  it('só um de dois compradores adquire o último stock disponível', async () => {
    const scenario = checkoutScenario();
    scenario.products[0]!.stockDisponivel = 500;
    await seedCheckoutScenario(connection(), scenario);
    const other = {
      ...scenario,
      buyerId: new Types.ObjectId(),
      chave: 'outra-chave-' + randomUUID(),
    };
    await createUserModel(connection()).create(
      userInput({
        _id: other.buyerId,
        emailNormalizado: other.buyerId.toHexString() + '@example.invalid',
        papeis: ['comprador'],
      }),
    );
    const results = await Promise.all([
      service(scenario)(scenario.chave, scenario.pedido),
      service(other)(other.chave, other.pedido),
    ]);
    expect(results.filter((r) => r.tipo === 'sucesso')).toHaveLength(1);
    expect(results.filter((r) => r.tipo === 'reconfirmacao_necessaria')).toHaveLength(1);
    expect((await state(scenario)).products[0]!.stockDisponivel).toBe(0);
    expect(await Order.countDocuments({ produtor: scenario.producers[0]!.userId })).toBe(1);
  });
  it.each(['preco', 'configuracao', 'comprador', 'produtor'] as const)(
    'alteração concorrente de %s não passa despercebida',
    async (kind) => {
      const scenario = await subject(2);
      interleave('products', async () => {
        if (kind === 'preco') {
          const doc = await createProductModel(connection())
            .findById(scenario.products[0]!._id)
            .orFail();
          doc.precoCent = 200;
          await doc.save();
        } else if (kind === 'configuracao') {
          const doc = await internalProducer(scenario);
          doc.set('comercial.localLevantamento', 'Local alterado');
          await doc.save();
        } else {
          const id = kind === 'comprador' ? scenario.buyerId : scenario.producers[0]!.userId;
          const doc = await createUserModel(connection())
            .findById(id)
            .select('+passwordHash')
            .orFail();
          doc.papeis = ['administrador'];
          await doc.save();
        }
      });
      const result = await service(scenario)(scenario.chave, scenario.pedido);
      expect(result.tipo).toBe(
        kind === 'comprador' || kind === 'produtor' ? 'recusado' : 'reconfirmacao_necessaria',
      );
      const persisted = await state(scenario);
      expect(persisted.orders).toHaveLength(0);
      for (const p of persisted.products) expect(p.stockDisponivel).toBe(10_000);
      for (const producer of persisted.producers)
        expect(producer.revisaoOperacional).toBe(
          kind === 'configuracao' && producer._id.equals(scenario.producers[0]!._id) ? 1 : 0,
        );
    },
  );
  it('falha na última order reverte âncora, stock e todas as guardas', async () => {
    const scenario = await subject(2);
    const before = await state(scenario);
    const original = mongo.Collection.prototype.insertOne;
    const failure = Error('Falha interna fictícia');
    let attemptedLast = false;
    vi.spyOn(mongo.Collection.prototype, 'insertOne').mockImplementation(async function (
      this: mongo.Collection,
      ...args
    ) {
      if (this.collectionName === 'orders' && !args[0].idempotencia) {
        attemptedLast = true;
        throw failure;
      }
      return original.apply(this, args);
    });
    await expect(service(scenario)(scenario.chave, scenario.pedido)).rejects.toBe(failure);
    expect(attemptedLast).toBe(true);
    expect(await state(scenario)).toEqual(before);
  });
  it('save antigo de utilizador não anula uma guarda nem altera permissões silenciosamente', async () => {
    const scenario = await subject();
    const User = createUserModel(connection());
    const stale = await User.findById(scenario.buyerId).select('+passwordHash').orFail();
    expect((await service(scenario)(scenario.chave, scenario.pedido)).tipo).toBe('sucesso');
    stale.papeis = ['administrador'];
    await expect(stale.save()).rejects.toMatchObject({ codigo: 'CONFLITO_VERSAO' });
    const fresh = await User.findById(scenario.buyerId).select('+passwordHash').orFail();
    fresh.papeis = ['administrador'];
    await fresh.save();
    expect(fresh.revisaoOperacional).toBe(2);
  });
});

describe('retentativas e recuperação após commit', () => {
  it('repete a transação abortada, conservando IDs e sem duplicar débitos', async () => {
    const scenario = await subject(2);
    const update = mongo.Collection.prototype.findOneAndUpdate;
    const insert = mongo.Collection.prototype.insertOne;
    const anchors: string[] = [];
    let failed = false;
    vi.spyOn(mongo.Collection.prototype, 'insertOne').mockImplementation(async function (
      this: mongo.Collection,
      ...args
    ) {
      if (this.collectionName === 'orders' && args[0].idempotencia)
        anchors.push(String(args[0]._id));
      return insert.apply(this, args);
    });
    vi.spyOn(mongo.Collection.prototype, 'findOneAndUpdate').mockImplementation(async function (
      this: mongo.Collection,
      ...args
    ) {
      const result = await update.apply(this, args);
      if (!failed && this.collectionName === 'products') {
        failed = true;
        throw new mongo.MongoServerError({ code: 112, errorLabels: ['TransientTransactionError'] });
      }
      return result;
    });
    expect((await service(scenario)(scenario.chave, scenario.pedido)).tipo).toBe('sucesso');
    expect(anchors).toHaveLength(2);
    expect(anchors[0]).toBe(anchors[1]);
    const persisted = await state(scenario);
    for (const product of persisted.products)
      expect(product).toMatchObject({ stockDisponivel: 9500, revisaoOperacional: 1 });
    for (const user of persisted.users) expect(user.revisaoOperacional).toBe(1);
    expect(persisted.orders).toHaveLength(2);
  });
  it('limita tentativas transitórias sem deixar efeitos parciais', async () => {
    const scenario = await subject();
    const before = await state(scenario);
    let attempts = 0;
    const original = mongo.Collection.prototype.findOne;
    vi.spyOn(mongo.Collection.prototype, 'findOne').mockImplementation(async function (
      this: mongo.Collection,
      ...args
    ) {
      const result = await original.apply(this, args);
      if (this.collectionName === 'products' && args[1]?.session) {
        attempts++;
        throw new mongo.MongoServerError({ code: 112, errorLabels: ['TransientTransactionError'] });
      }
      return result;
    });
    expect(
      await service(scenario, { maxAttempts: 2 })(scenario.chave, scenario.pedido),
    ).toMatchObject({ tipo: 'resultado_indeterminado', repetirComMesmaChave: true });
    expect(attempts).toBe(2);
    expect(await state(scenario)).toEqual(before);
  });
  it.each([false, true])(
    'commit real com resposta perdida, label desconhecido=%s, não volta a executar a compra',
    async (unknownLabel) => {
      const scenario = await subject(2);
      const commit = mongo.ClientSession.prototype.commitTransaction;
      const insert = mongo.Collection.prototype.insertOne;
      let wrote = false;
      let injected = false;
      vi.spyOn(mongo.Collection.prototype, 'insertOne').mockImplementation(async function (
        this: mongo.Collection,
        ...args
      ) {
        const result = await insert.apply(this, args);
        if (this.collectionName === 'orders') wrote = true;
        return result;
      });
      vi.spyOn(mongo.ClientSession.prototype, 'commitTransaction').mockImplementation(
        async function (this: mongo.ClientSession, ...args) {
          await commit.apply(this, args);
          if (wrote && !injected) {
            injected = true;
            if (unknownLabel)
              throw new mongo.MongoServerError({
                code: 91,
                errorLabels: ['UnknownTransactionCommitResult'],
              });
            throw new mongo.MongoNetworkError('Resposta fictícia perdida');
          }
        },
      );
      const run = service(scenario);
      const result = await run(scenario.chave, scenario.pedido);
      expect(injected).toBe(true);
      expect(result.tipo).toBe('sucesso');
      const before = await state(scenario);
      expect(before.orders).toHaveLength(2);
      for (const product of before.products) expect(product.stockDisponivel).toBe(9500);
      const replay = await run(scenario.chave, scenario.pedido);
      expect(replay.tipo).toBe('sucesso');
      if (result.tipo !== 'sucesso' || replay.tipo !== 'sucesso') throw Error('Expected receipt');
      expect(replay.recibo).toEqual(result.recibo);
      expect(await state(scenario)).toEqual(before);
    },
  );
});
