import { randomUUID } from 'node:crypto';
import { Types, mongo } from 'mongoose';
import type { Model } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseEnvironment } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/database/connection.js';
import { createOrderModel } from '../../src/modules/orders/order.model.js';
import type { OrderRecord } from '../../src/modules/orders/order.types.js';
import { validateCheckoutInput } from '../../src/modules/orders/checkout.validation.js';
import {
  CheckoutIdempotencyConflict,
  isCheckoutIdempotencyKeyConflict,
} from '../../src/modules/orders/checkout.idempotency.js';
import {
  checkoutIdempotencyProjection,
  findCheckoutPurchase,
  recoverCheckoutPurchase,
} from '../../src/modules/orders/checkout-idempotency.repository.js';
import {
  checkoutIdempotencyFixture,
  cloneCheckoutFixture,
} from '../support/checkout-idempotency-fixtures.js';
import { orderEvent, orderInput } from '../support/order-fixtures.js';

const configuration = parseEnvironment({
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
  MONGODB_DB_NAME: 'docampo_test_' + randomUUID().replaceAll('-', ''),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: '2000',
});
let database: Awaited<ReturnType<typeof connectDatabase>> | undefined;
let Order: Model<OrderRecord>;
function connection() {
  if (!database) throw Error('Test database missing');
  return database.connection;
}
const transactionOptions = {
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
  readPreference: 'primary',
} as const;

beforeAll(async () => {
  database = await connectDatabase(configuration);
  expect((await connection().db!.admin().command({ hello: 1 })).setName).toBe('rs-dcm-test');
  expect((await connection().db!.admin().command({ buildInfo: 1 })).version).toBe('8.0.34');
  Order = createOrderModel(connection());
  await Order.createCollection();
  await Order.createIndexes();
});
afterAll(async () => {
  if (!database) return;
  try {
    await connection().dropDatabase();
  } finally {
    await database.close();
  }
});

/** Provisionamento de fixtures, apenas na base efémera: não é serviço de checkout. */
async function persist(fixture: ReturnType<typeof checkoutIdempotencyFixture>) {
  const session = await connection().startSession();
  try {
    session.startTransaction(transactionOptions);
    for (const member of fixture.members) await new Order(member).save({ session });
    await session.commitTransaction();
  } finally {
    if (session.inTransaction()) await session.abortTransaction();
    await session.endSession();
  }
}

describe('procura e recuperação confirmadas com MongoDB real', () => {
  it('distingue uma chave não observada de uma recuperação incerta, sem criar coleções ou dados', async () => {
    const fixture = checkoutIdempotencyFixture();
    const before = await Order.countDocuments();
    expect(await findCheckoutPurchase(connection(), fixture.input)).toEqual({
      tipo: 'inexistente',
    });
    expect(await recoverCheckoutPurchase(connection(), fixture.input)).toMatchObject({
      tipo: 'resultado_indeterminado',
      motivo: 'CONFIRMACAO_NAO_OBSERVADA',
      repetirComMesmaChave: true,
    });
    expect(await Order.countDocuments()).toBe(before);
    expect(connection().modelNames()).toEqual(['Order']);
    expect((await connection().db!.listCollections().toArray()).map((c) => c.name)).toEqual([
      'orders',
    ]);
  });
  it.each([1, 2] as const)(
    'reconhece replay integral de %s produtores e não duplica encomendas',
    async (count) => {
      const fixture = checkoutIdempotencyFixture(count);
      await persist(fixture);
      const before = await Order.countDocuments();
      const first = await findCheckoutPurchase(connection(), fixture.input);
      const repeated = await recoverCheckoutPurchase(connection(), fixture.input);
      expect(first).toEqual(repeated);
      expect(first.tipo).toBe('sucesso');
      if (first.tipo !== 'sucesso') throw Error('Expected replay');
      expect(first.recibo.operacaoCompraId).toBe(fixture.orders[0]!.operacaoCompraId);
      expect(first.recibo.totalCent).toBe(75 * count);
      expect(first.recibo.encomendas).toHaveLength(count);
      expect(first.recibo.criadaEm).toBe(
        fixture.plan.idempotencia.resultadoOriginal.criadaEm.toISOString(),
      );
      expect(await Order.countDocuments()).toBe(before);
      expect(
        await Order.collection.countDocuments({
          'idempotencia.chave': fixture.input.chaveIdempotencia,
        }),
      ).toBe(1);
    },
  );
  it('rejeita fingerprint diferente e não altera o resultado persistido', async () => {
    const fixture = checkoutIdempotencyFixture();
    await persist(fixture);
    const changed = cloneCheckoutFixture(fixture.input.pedido);
    const lines = changed.linhas.map((line, i) => (i === 0 ? { ...line, quantidade: 1000 } : line));
    const input = validateCheckoutInput(fixture.input.contexto, fixture.input.chaveIdempotencia, {
      ...changed,
      linhas: lines,
    });
    await expect(findCheckoutPurchase(connection(), input)).rejects.toBeInstanceOf(
      CheckoutIdempotencyConflict,
    );
    expect((await recoverCheckoutPurchase(connection(), fixture.input)).tipo).toBe('sucesso');
    expect(
      await Order.collection.countDocuments({
        operacaoCompraId: fixture.orders[0]!.operacaoCompraId,
      }),
    ).toBe(2);
  });
  it('não revela recibo ou grupo a outro comprador da mesma chave', async () => {
    const fixture = checkoutIdempotencyFixture();
    await persist(fixture);
    const input = validateCheckoutInput(
      { compradorContaId: '000000000000000000000099' },
      fixture.input.chaveIdempotencia,
      fixture.input.pedido,
    );
    let failure: unknown;
    try {
      await recoverCheckoutPurchase(connection(), input);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(CheckoutIdempotencyConflict);
    expect(JSON.stringify(failure)).not.toContain(fixture.input.chaveIdempotencia);
    expect(JSON.stringify(failure)).not.toContain(fixture.orders[0]!.operacaoCompraId);
  });
  it('preserva recibo original após evolução comercial válida da order', async () => {
    const fixture = checkoutIdempotencyFixture(1);
    await persist(fixture);
    const before = await findCheckoutPurchase(connection(), fixture.input);
    const order = await Order.findById(fixture.anchor._id).orFail();
    order.set('estado', 'confirmada');
    order.set('historicoEstado', [
      ...order.historicoEstado,
      orderEvent('confirmacao-ficticia', 'confirmada', 'produtor', 1),
    ]);
    await order.save();
    expect((await Order.findById(order._id).orFail()).estado).toBe('confirmada');
    expect(await recoverCheckoutPurchase(connection(), fixture.input)).toEqual(before);
  });
  it('projeção e resposta não incluem morada, contacto, pagamentos ou metadados secretos', async () => {
    const fixture = checkoutIdempotencyFixture(2, undefined, true);
    await persist(fixture);
    const original = mongo.Collection.prototype.findOne;
    const spy = vi.spyOn(mongo.Collection.prototype, 'findOne');
    spy.mockImplementationOnce(async function (this: mongo.Collection, ...args) {
      expect(args[1]?.projection).toEqual(checkoutIdempotencyProjection);
      expect(Object.keys(args[1]!.projection!)).not.toContain('entrega');
      return original.apply(this, args);
    });
    const result = await findCheckoutPurchase(connection(), fixture.input);
    expect(result.tipo).toBe('sucesso');
    for (const secret of [
      'Morada fictícia privada',
      'Contacto fictício privado',
      'historicoEstado',
      'idempotencia',
      fixture.input.chaveIdempotencia,
      fixture.expected.hashCanonico,
    ])
      expect(JSON.stringify(result)).not.toContain(secret);
  });
});

describe('integridade, índices e documentos antigos', () => {
  it('âncora isolada não é suficiente; só a presença do grupo integral permite replay', async () => {
    const fixture = checkoutIdempotencyFixture();
    await new Order(fixture.anchor).save();
    expect(await findCheckoutPurchase(connection(), fixture.input)).toMatchObject({
      tipo: 'resultado_indeterminado',
      motivo: 'GRUPO_INCONSISTENTE',
    });
    await new Order(fixture.members[1]).save();
    expect((await findCheckoutPurchase(connection(), fixture.input)).tipo).toBe('sucesso');
  });
  it('recusa grupos com membro extra na mesma operação, mesmo que o manifesto original esteja completo', async () => {
    const fixture = checkoutIdempotencyFixture();
    await persist(fixture);
    await new Order(
      orderInput('pendente', {
        operacaoCompraId: fixture.orders[0]!.operacaoCompraId,
        produtor: new Types.ObjectId(),
      }),
    ).save();
    expect(await recoverCheckoutPurchase(connection(), fixture.input)).toMatchObject({
      tipo: 'resultado_indeterminado',
      motivo: 'GRUPO_INCONSISTENTE',
    });
  });
  it('recusa membro financeiramente corrompido sem devolver resultado parcial', async () => {
    const fixture = checkoutIdempotencyFixture();
    await persist(fixture);
    // Corrupção deliberada da fixture: este bypass não existe na camada implementada.
    await Order.collection.updateOne({ _id: fixture.members[1]!._id }, { $set: { totalCent: 76 } });
    expect(await recoverCheckoutPurchase(connection(), fixture.input)).toMatchObject({
      tipo: 'resultado_indeterminado',
      motivo: 'GRUPO_INCONSISTENTE',
    });
  });
  it('mantém índices existentes e reconhece a colisão real da chave global', async () => {
    const fixture = checkoutIdempotencyFixture(1);
    await persist(fixture);
    const second = checkoutIdempotencyFixture(1, fixture.input.chaveIdempotencia);
    let failure: unknown;
    try {
      await persist(second);
    } catch (error) {
      failure = error;
    }
    expect(isCheckoutIdempotencyKeyConflict(failure)).toBe(true);
    expect(
      await Order.collection.countDocuments({
        operacaoCompraId: second.orders[0]!.operacaoCompraId,
      }),
    ).toBe(0);
    const indexes = await Order.listIndexes();
    expect(indexes).toHaveLength(6);
    expect(indexes).toContainEqual(
      expect.objectContaining({
        key: { 'idempotencia.chave': 1 },
        unique: true,
        partialFilterExpression: { 'idempotencia.chave': { $type: 'string' } },
      }),
    );
    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { operacaoCompraId: 1, produtor: 1 }, unique: true }),
    );
    expect(indexes.some((index) => index.expireAfterSeconds !== undefined)).toBe(false);
  });
  it('tolera orders antigas sem bloco idempotente sem lhes inventar uma chave', async () => {
    const fixture = checkoutIdempotencyFixture(1);
    await new Order(fixture.orders[0]).save();
    const before = await Order.collection.findOne({ _id: fixture.orders[0]!._id });
    expect(await findCheckoutPurchase(connection(), fixture.input)).toEqual({
      tipo: 'inexistente',
    });
    expect((await recoverCheckoutPurchase(connection(), fixture.input)).tipo).toBe(
      'resultado_indeterminado',
    );
    expect(await Order.collection.findOne({ _id: fixture.orders[0]!._id })).toEqual(before);
    expect(before).not.toHaveProperty('idempotencia');
  });
  it('metadados parciais antigos não provocam erro nem uma falsa confirmação', async () => {
    const fixture = checkoutIdempotencyFixture(1);
    await persist(fixture);
    await Order.collection.updateOne(
      { _id: fixture.anchor._id },
      { $unset: { 'idempotencia.resultadoOriginal': '' } },
    );
    expect((await recoverCheckoutPurchase(connection(), fixture.input)).tipo).toBe(
      'resultado_indeterminado',
    );
  });
});

describe('concorrência e leituras consistentes', () => {
  it.each([false, true])(
    'o índice arbitra dois grupos concorrentes; compradores diferentes=%s',
    async (differentBuyer) => {
      const first = checkoutIdempotencyFixture();
      const second = checkoutIdempotencyFixture(
        2,
        first.input.chaveIdempotencia,
        false,
        differentBuyer ? new Types.ObjectId() : first.orders[0]!.comprador,
      );
      const results = await Promise.allSettled([persist(first), persist(second)]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const winner = results[0]!.status === 'fulfilled' ? first : second;
      const loser = winner === first ? second : first;
      expect(
        await Order.collection.countDocuments({
          operacaoCompraId: winner.orders[0]!.operacaoCompraId,
        }),
      ).toBe(2);
      expect(
        await Order.collection.countDocuments({
          operacaoCompraId: loser.orders[0]!.operacaoCompraId,
        }),
      ).toBe(0);
      expect(
        await Order.collection.countDocuments({
          'idempotencia.chave': first.input.chaveIdempotencia,
        }),
      ).toBe(1);
      const reads = await Promise.all([
        findCheckoutPurchase(connection(), winner.input),
        recoverCheckoutPurchase(connection(), winner.input),
      ]);
      expect(reads[0]).toEqual(reads[1]);
      expect(reads[0]!.tipo).toBe('sucesso');
    },
  );
  it('não interpreta escritas não confirmadas noutra sessão como replay', async () => {
    const fixture = checkoutIdempotencyFixture();
    const session = await connection().startSession();
    try {
      session.startTransaction(transactionOptions);
      for (const row of fixture.members) await new Order(row).save({ session });
      expect(await findCheckoutPurchase(connection(), fixture.input)).toEqual({
        tipo: 'inexistente',
      });
      expect((await recoverCheckoutPurchase(connection(), fixture.input)).tipo).toBe(
        'resultado_indeterminado',
      );
      await session.commitTransaction();
      expect((await recoverCheckoutPurchase(connection(), fixture.input)).tipo).toBe('sucesso');
    } finally {
      if (session.inTransaction()) await session.abortTransaction();
      await session.endSession();
    }
  });
  it('rollback técnico não deixa chave nem encomendas e ausência em recuperação continua incerta', async () => {
    const fixture = checkoutIdempotencyFixture();
    const session = await connection().startSession();
    try {
      session.startTransaction(transactionOptions);
      for (const row of fixture.members) await new Order(row).save({ session });
      await session.abortTransaction();
      expect(await findCheckoutPurchase(connection(), fixture.input)).toEqual({
        tipo: 'inexistente',
      });
      expect((await recoverCheckoutPurchase(connection(), fixture.input)).tipo).toBe(
        'resultado_indeterminado',
      );
      expect(
        await Order.collection.countDocuments({
          operacaoCompraId: fixture.orders[0]!.operacaoCompraId,
        }),
      ).toBe(0);
    } finally {
      if (session.inTransaction()) await session.abortTransaction();
      await session.endSession();
    }
  });
  it('lê âncora e membros no mesmo snapshot, sem juntar versões de leituras diferentes', async () => {
    const fixture = checkoutIdempotencyFixture();
    await persist(fixture);
    const original = mongo.Collection.prototype.findOne;
    vi.spyOn(mongo.Collection.prototype, 'findOne').mockImplementationOnce(async function (
      this: mongo.Collection,
      ...args
    ) {
      const anchor = await original.apply(this, args);
      // Intercalação controlada após estabelecer snapshot; simula escritor externo não cooperante.
      await Order.collection.deleteOne({ _id: fixture.members[1]!._id });
      return anchor;
    });
    expect((await recoverCheckoutPurchase(connection(), fixture.input)).tipo).toBe('sucesso');
    expect((await recoverCheckoutPurchase(connection(), fixture.input)).tipo).toBe(
      'resultado_indeterminado',
    );
  });
});

describe('falhas transitórias e resultado de commit desconhecido', () => {
  it('recupera após commit real seguido de resposta perdida, sem novas escritas', async () => {
    const fixture = checkoutIdempotencyFixture();
    const failure = new mongo.MongoServerError({
      code: 91,
      errorLabels: ['UnknownTransactionCommitResult'],
    });
    await expect(
      (async () => {
        await persist(fixture);
        throw failure;
      })(),
    ).rejects.toBe(failure);
    const before = await Order.collection
      .find({ operacaoCompraId: fixture.orders[0]!.operacaoCompraId })
      .toArray();
    const results = await Promise.all([
      recoverCheckoutPurchase(connection(), fixture.input),
      recoverCheckoutPurchase(connection(), fixture.input),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0]!.tipo).toBe('sucesso');
    expect(
      await Order.collection
        .find({ operacaoCompraId: fixture.orders[0]!.operacaoCompraId })
        .toArray(),
    ).toEqual(before);
  });
  it('repete apenas a transação de leitura após falha transitória injetada junto de uma leitura real', async () => {
    const fixture = checkoutIdempotencyFixture();
    await persist(fixture);
    const original = mongo.Collection.prototype.findOne;
    const failure = new mongo.MongoServerError({
      code: 112,
      errorLabels: ['TransientTransactionError'],
    });
    const spy = vi.spyOn(mongo.Collection.prototype, 'findOne');
    spy.mockImplementationOnce(async function (this: mongo.Collection, ...args) {
      await original.apply(this, args);
      throw failure;
    });
    expect((await recoverCheckoutPurchase(connection(), fixture.input)).tipo).toBe('sucesso');
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(failure.hasErrorLabel('TransientTransactionError')).toBe(true);
    expect(
      await Order.collection.countDocuments({
        operacaoCompraId: fixture.orders[0]!.operacaoCompraId,
      }),
    ).toBe(2);
  });
  it('falhas transitórias persistentes esgotam o orçamento sem fingir inexistência', async () => {
    const fixture = checkoutIdempotencyFixture();
    await persist(fixture);
    const original = mongo.Collection.prototype.findOne;
    const failure = new mongo.MongoServerError({
      code: 112,
      errorLabels: ['TransientTransactionError'],
    });
    vi.spyOn(mongo.Collection.prototype, 'findOne').mockImplementation(async function (
      this: mongo.Collection,
      ...args
    ) {
      await original.apply(this, args);
      throw failure;
    });
    expect(
      await recoverCheckoutPurchase(connection(), fixture.input, { timeoutMS: 100 }),
    ).toMatchObject({ tipo: 'resultado_indeterminado', motivo: 'PERSISTENCIA_INDISPONIVEL' });
    expect(
      await Order.collection.countDocuments({
        operacaoCompraId: fixture.orders[0]!.operacaoCompraId,
      }),
    ).toBe(2);
  });
  it('não confunde erro de comunicação com compra inexistente', async () => {
    const fixture = checkoutIdempotencyFixture();
    await persist(fixture);
    vi.spyOn(mongo.Collection.prototype, 'findOne').mockRejectedValueOnce(
      new mongo.MongoNetworkError('Mensagem privada omitida'),
    );
    const result = await findCheckoutPurchase(connection(), fixture.input);
    expect(result).toMatchObject({
      tipo: 'resultado_indeterminado',
      motivo: 'PERSISTENCIA_INDISPONIVEL',
    });
    expect(JSON.stringify(result)).not.toContain('Mensagem privada omitida');
  });
  it('não mascara falhas internas inesperadas nem as transforma em validação', async () => {
    const fixture = checkoutIdempotencyFixture();
    const failure = new Error('Erro interno controlado');
    vi.spyOn(mongo.Collection.prototype, 'findOne').mockRejectedValueOnce(failure);
    await expect(recoverCheckoutPurchase(connection(), fixture.input)).rejects.toBe(failure);
  });
  it('uma ligação efetivamente fechada produz resultado indeterminado, sem fallback', async () => {
    const fixture = checkoutIdempotencyFixture();
    const extra = await connectDatabase(configuration);
    await extra.close();
    expect(await recoverCheckoutPurchase(extra.connection, fixture.input)).toMatchObject({
      tipo: 'resultado_indeterminado',
      motivo: 'PERSISTENCIA_INDISPONIVEL',
    });
  });
});
