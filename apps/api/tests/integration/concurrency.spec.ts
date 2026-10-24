import { randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import type { ClientSession, Model } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/database/connection.js';
import { isMongoWriteConflict } from '../../src/modules/concurrency/concurrency-error.js';
import { createProductModel } from '../../src/modules/products/product.model.js';
import type { ProductRecord } from '../../src/modules/products/product.types.js';
import { decreaseProductStock } from '../../src/modules/products/product-stock.repository.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import type { ProducerRecord } from '../../src/modules/producers/producer.model.js';
import { guardProducerEligibility } from '../../src/modules/producers/producer-guard.repository.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import type { UserRecord } from '../../src/modules/users/user.model.js';
import { producerInput, userInput, decisionInput } from '../support/identity-fixtures.js';
import { publishedProductInput } from '../support/product-fixtures.js';
import {
  fictitiousProducerIban,
  producerCommercialInput,
} from '../support/producer-commercial-fixtures.js';
import {
  concurrentSaleUnit,
  producerGuard,
  stockDecrease,
} from '../support/concurrency-fixtures.js';

const configuration = parseEnvironment({
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
  MONGODB_DB_NAME: `docampo_test_${randomUUID().replaceAll('-', '')}`,
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: '2000',
});
let database: Awaited<ReturnType<typeof connectDatabase>> | undefined;
let Product: Model<ProductRecord>;
let Producer: Model<ProducerRecord>;
let User: Model<UserRecord>;
let sequence = 0;
const transactionOptions = {
  readConcern: { level: 'snapshot' as const },
  writeConcern: { w: 'majority' as const },
  readPreference: 'primary' as const,
};
beforeAll(async () => {
  database = await connectDatabase(configuration);
  const hello = await database.connection.db!.admin().command({ hello: 1 });
  expect(hello.setName).toBe('rs-dcm-test');
  expect(hello.isWritablePrimary).toBe(true);
  const info = await database.connection.db!.admin().command({ buildInfo: 1 });
  expect(info.version).toBe('8.0.34');
  User = createUserModel(database.connection);
  Producer = createProducerModel(database.connection);
  Product = createProductModel(database.connection);
  for (const model of [User, Producer, Product]) {
    await model.createCollection();
    await model.createIndexes();
  }
});
afterAll(async () => {
  if (!database) return;
  try {
    await database.connection.dropDatabase();
  } finally {
    await database.close();
  }
});
function connection() {
  if (!database) throw new Error('MongoDB de teste indisponível.');
  return database.connection;
}
function internalProducer(id: ProducerRecord['_id']) {
  return Producer.findById(id)
    .select('+telefone +aprovacao.decisao.autor +comercial.pagamentoPrivado')
    .orFail();
}
async function subject(stock = 1) {
  sequence++;
  const user = await User.create(
    userInput({
      emailNormalizado: `concorrencia-${sequence}@example.invalid`,
      papeis: ['produtor'],
    }),
  );
  const producer = await Producer.create(
    producerInput({
      userId: user._id,
      aprovacao: decisionInput(),
      comercial: producerCommercialInput(),
    }),
  );
  const product = await Product.create(
    publishedProductInput({
      produtor: user._id,
      unidadeVenda: { ...concurrentSaleUnit },
      stockDisponivel: stock,
    }),
  );
  return {
    user,
    producer,
    product,
    debit: stockDecrease({ produtoId: product._id, produtorId: user._id }),
    guard: producerGuard({ produtorId: user._id }),
  };
}
async function stop(session: ClientSession) {
  if (session.inTransaction()) await session.abortTransaction();
  await session.endSession();
}

describe('stock e revisão operacional com MongoDB real', () => {
  it('reduz atomicamente e incrementa revisão sem criar encomendas/coleções novas', async () => {
    const item = await subject(2);
    const result = await decreaseProductStock(connection(), item.debit);
    expect(result).toMatchObject({ stockDisponivel: 1, revisaoOperacional: 1 });
    expect(connection().modelNames().sort()).toEqual(['ProducerProfile', 'Product', 'User']);
    expect(
      (await connection().db!.listCollections().toArray()).map((row) => row.name).sort(),
    ).toEqual(['producers', 'products', 'users']);
    expect((await Product.findById(item.product._id).orFail()).stockDisponivel).toBe(1);
  });
  it('duas operações sobre a última unidade aplicam apenas uma redução', async () => {
    const item = await subject();
    const results = await Promise.allSettled([
      decreaseProductStock(connection(), item.debit),
      decreaseProductStock(connection(), item.debit),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((row) => row.status === 'rejected');
    expect(
      rejected?.status === 'rejected' &&
        ['CONFLITO_VERSAO', 'STOCK_INSUFICIENTE'].includes(rejected.reason.codigo),
    ).toBe(true);
    const raw = await Product.collection.findOne({ _id: item.product._id });
    expect(raw?.stockDisponivel).toBe(0);
    expect(raw?.revisaoOperacional).toBe(1);
  });
  it('stock insuficiente não altera stock/revisão', async () => {
    const item = await subject(0);
    await expect(decreaseProductStock(connection(), item.debit)).rejects.toMatchObject({
      codigo: 'STOCK_INSUFICIENTE',
    });
    expect((await Product.collection.findOne({ _id: item.product._id }))?.revisaoOperacional).toBe(
      0,
    );
  });
  it('versão antiga, produto arquivado e nova oferta são detetados', async () => {
    const item = await subject(3);
    const edited = await Product.findById(item.product._id).orFail();
    edited.precoCent = 200;
    await edited.save();
    await expect(decreaseProductStock(connection(), item.debit)).rejects.toMatchObject({
      codigo: 'CONFLITO_VERSAO',
    });
    await expect(
      decreaseProductStock(connection(), { ...item.debit, revisaoEsperada: 1 }),
    ).rejects.toMatchObject({ codigo: 'OFERTA_ALTERADA' });
    edited.estadoPublicacao = 'arquivado';
    await edited.save();
    expect(edited.revisaoOperacional).toBe(2);
    await expect(
      decreaseProductStock(connection(), {
        ...item.debit,
        revisaoEsperada: 2,
        precoAceiteCent: 200,
      }),
    ).rejects.toMatchObject({ codigo: 'PRODUTO_INDISPONIVEL' });
  });
  it('save antigo não pode repor silenciosamente stock debitado', async () => {
    const item = await subject(2);
    const old = await Product.findById(item.product._id).orFail();
    await decreaseProductStock(connection(), item.debit);
    old.stockDisponivel = 10;
    await expect(old.save()).rejects.toMatchObject({ codigo: 'CONFLITO_VERSAO' });
    expect((await Product.findById(item.product._id).orFail()).stockDisponivel).toBe(1);
  });
  it('dois save concorrentes não perdem alterações e save sucessivo funciona', async () => {
    const item = await subject();
    const first = await internalProducer(item.producer._id);
    const second = await internalProducer(item.producer._id);
    first.nomePublico = 'Primeira alteração';
    second.nomePublico = 'Segunda alteração';
    const results = await Promise.allSettled([first.save(), second.save()]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    const fresh = await internalProducer(item.producer._id);
    expect(fresh.revisaoOperacional).toBe(1);
    fresh.nomePublico = 'Terceira alteração';
    await fresh.save();
    fresh.nomePublico = 'Quarta alteração';
    await fresh.save();
    expect(fresh.revisaoOperacional).toBe(3);
  });
  it('aceita stock legado sem revisão e inicializa-a apenas numa escrita segura', async () => {
    const item = await subject(2);
    // Preparação explícita de fixture antiga, não um caminho de produção.
    await Product.collection.updateOne(
      { _id: item.product._id },
      { $unset: { revisaoOperacional: '' } },
    );
    const before = await Product.collection.findOne({ _id: item.product._id });
    expect(before).not.toHaveProperty('revisaoOperacional');
    expect((await Product.findById(item.product._id).orFail()).revisaoOperacional).toBe(0);
    const result = await decreaseProductStock(connection(), item.debit);
    expect(result.revisaoOperacional).toBe(1);
    expect(result.stockDisponivel).toBe(1);
  });
  it('save inicializa revisão legada sem mudar IDs, stock, aprovação ou configuração', async () => {
    const item = await subject();
    await Product.collection.updateOne(
      { _id: item.product._id },
      { $unset: { revisaoOperacional: '' } },
    );
    await Producer.collection.updateOne(
      { _id: item.producer._id },
      { $unset: { revisaoOperacional: '' } },
    );
    const producer = await internalProducer(item.producer._id);
    const before = producer.toObject({ transform: false });
    producer.nomePublico = 'Perfil antigo atualizado';
    await producer.save();
    expect(producer.revisaoOperacional).toBe(1);
    expect(producer.toObject({ transform: false }).aprovacao).toEqual(before.aprovacao);
    expect(producer.toObject({ transform: false }).comercial).toEqual(before.comercial);
    const product = await Product.findById(item.product._id).orFail();
    product.nome = 'Nome atualizado';
    await product.save();
    expect(product.revisaoOperacional).toBe(1);
    expect(product.stockDisponivel).toBe(1);
    expect(product._id.equals(item.product._id)).toBe(true);
  });
  it('mantém bloqueados updateOne, findOneAndUpdate e bulkWrite genéricos', async () => {
    const item = await subject();
    await expect(
      Product.updateOne({ _id: item.product._id }, { stockDisponivel: 0 }),
    ).rejects.toThrow('save');
    await expect(
      Producer.findOneAndUpdate({ _id: item.producer._id }, { 'aprovacao.estado': 'pendente' }),
    ).rejects.toThrow('save');
    await expect(
      Product.bulkWrite([
        { updateOne: { filter: { _id: item.product._id }, update: { stockDisponivel: 0 } } },
      ]),
    ).rejects.toThrow('bulk');
  });
});

describe('sessões explícitas, guarda e rollback', () => {
  it('guarda exige transação ativa e não escreve fora da sessão', async () => {
    const item = await subject();
    const session = await connection().startSession();
    try {
      await expect(
        guardProducerEligibility(connection(), item.guard, undefined as unknown as ClientSession),
      ).rejects.toMatchObject({ codigo: 'TRANSACAO_OBRIGATORIA' });
      await expect(
        guardProducerEligibility(connection(), item.guard, session),
      ).rejects.toMatchObject({ codigo: 'TRANSACAO_OBRIGATORIA' });
      await expect(decreaseProductStock(connection(), item.debit, session)).rejects.toMatchObject({
        codigo: 'TRANSACAO_OBRIGATORIA',
      });
      expect(
        (await Producer.collection.findOne({ _id: item.producer._id }))?.revisaoOperacional,
      ).toBe(0);
      expect((await Product.collection.findOne({ _id: item.product._id }))?.stockDisponivel).toBe(
        1,
      );
    } finally {
      await stop(session);
    }
  });
  it('guarda faz escrita real, sem alterar aprovação/configuração ou dados privados', async () => {
    const item = await subject();
    const before = await Producer.collection.findOne({ _id: item.producer._id });
    const session = await connection().startSession();
    try {
      session.startTransaction(transactionOptions);
      const result = await guardProducerEligibility(connection(), item.guard, session);
      expect(result.revisaoOperacional).toBe(1);
      expect(JSON.stringify(result)).not.toContain(fictitiousProducerIban);
      expect(
        (await Producer.collection.findOne({ _id: item.producer._id }))?.revisaoOperacional,
      ).toBe(0);
      await session.commitTransaction();
      const after = await Producer.collection.findOne({ _id: item.producer._id });
      expect(after?.revisaoOperacional).toBe(1);
      expect(after?.aprovacao).toEqual(before?.aprovacao);
      expect(after?.comercial).toEqual(before?.comercial);
      expect(after?.updatedAt).toEqual(before?.updatedAt);
    } finally {
      await stop(session);
    }
  });
  it('rollback técnico reverte simultaneamente guarda e débito', async () => {
    const item = await subject();
    const session = await connection().startSession();
    try {
      session.startTransaction(transactionOptions);
      await guardProducerEligibility(connection(), item.guard, session);
      await decreaseProductStock(connection(), item.debit, session);
      expect(
        (await Product.collection.findOne({ _id: item.product._id }, { session }))?.stockDisponivel,
      ).toBe(0);
      expect((await Product.collection.findOne({ _id: item.product._id }))?.stockDisponivel).toBe(
        1,
      );
      await session.abortTransaction();
      expect(
        (await Product.collection.findOne({ _id: item.product._id }))?.revisaoOperacional,
      ).toBe(0);
      expect(
        (await Producer.collection.findOne({ _id: item.producer._id }))?.revisaoOperacional,
      ).toBe(0);
    } finally {
      await stop(session);
    }
  });
  it('save de aprovação usa a mesma sessão e também é revertido', async () => {
    const item = await subject();
    const session = await connection().startSession();
    try {
      session.startTransaction(transactionOptions);
      const document = await internalProducer(item.producer._id).session(session);
      document.set('aprovacao', {
        estado: 'pendente',
        submetidaEm: new Date('2026-10-23T09:00:00Z'),
      });
      await document.save();
      expect(
        (await Producer.collection.findOne({ _id: item.producer._id }, { session }))
          ?.revisaoOperacional,
      ).toBe(1);
      await session.abortTransaction();
      expect(
        (await Producer.collection.findOne({ _id: item.producer._id }))?.aprovacao.estado,
      ).toBe('aprovado');
      expect(
        (await Producer.collection.findOne({ _id: item.producer._id }))?.revisaoOperacional,
      ).toBe(0);
    } finally {
      await stop(session);
    }
  });
  it.each(['pendente', 'sem-configuracao'] as const)('não guarda produtor %s', async (mode) => {
    const item = await subject();
    const document = await internalProducer(item.producer._id);
    if (mode === 'pendente')
      document.set('aprovacao', {
        estado: 'pendente',
        submetidaEm: new Date('2026-10-23T09:00:00Z'),
      });
    else document.set('comercial', undefined);
    await document.save();
    const session = await connection().startSession();
    try {
      session.startTransaction(transactionOptions);
      await expect(
        guardProducerEligibility(connection(), { ...item.guard, revisaoEsperada: 1 }, session),
      ).rejects.toMatchObject({ codigo: 'PRODUTOR_INELEGIVEL' });
    } finally {
      await stop(session);
    }
  });
  it('guarda legada inicializa revisão e preserva tudo o resto', async () => {
    const item = await subject();
    await Producer.collection.updateOne(
      { _id: item.producer._id },
      { $unset: { revisaoOperacional: '' } },
    );
    const session = await connection().startSession();
    try {
      session.startTransaction(transactionOptions);
      expect(
        (await guardProducerEligibility(connection(), item.guard, session)).revisaoOperacional,
      ).toBe(1);
      await session.commitTransaction();
    } finally {
      await stop(session);
    }
  });
  it('uma guarda confirmada invalida save administrativo carregado anteriormente', async () => {
    const item = await subject();
    const old = await internalProducer(item.producer._id);
    const session = await connection().startSession();
    try {
      session.startTransaction(transactionOptions);
      await guardProducerEligibility(connection(), item.guard, session);
      await session.commitTransaction();
    } finally {
      await stop(session);
    }
    old.set('aprovacao', { estado: 'pendente', submetidaEm: new Date('2026-10-23T09:00:00Z') });
    await expect(old.save()).rejects.toMatchObject({ codigo: 'CONFLITO_VERSAO' });
    expect((await internalProducer(item.producer._id)).aprovacao.estado).toBe('aprovado');
  });
});

describe('intercalações controladas, sem sleeps', () => {
  it.each(['aprovacao', 'configuracao'] as const)(
    'mudança concorrente de %s gera write conflict e desfaz o débito',
    async (kind) => {
      const item = await subject();
      const session = await connection().startSession();
      try {
        session.startTransaction(transactionOptions);
        await Producer.collection.findOne({ _id: item.producer._id }, { session });
        await decreaseProductStock(connection(), item.debit, session);
        const outside = await internalProducer(item.producer._id);
        if (kind === 'aprovacao')
          outside.set('aprovacao', {
            estado: 'pendente',
            submetidaEm: new Date('2026-10-23T09:00:00Z'),
          });
        else outside.set('comercial.taxaEntregaCent', 350);
        await outside.save();
        let failure: unknown;
        try {
          await guardProducerEligibility(connection(), item.guard, session);
        } catch (error) {
          failure = error;
        }
        expect(isMongoWriteConflict(failure)).toBe(true);
        expect(
          failure instanceof mongo.MongoServerError &&
            failure.hasErrorLabel('TransientTransactionError'),
        ).toBe(true);
        await session.abortTransaction();
        expect((await Product.collection.findOne({ _id: item.product._id }))?.stockDisponivel).toBe(
          1,
        );
        expect(
          (await Producer.collection.findOne({ _id: item.producer._id }))?.revisaoOperacional,
        ).toBe(1);
      } finally {
        await stop(session);
      }
    },
  );
  it.each(['estado', 'stock'] as const)(
    'mudança concorrente de %s do produto invalida snapshot e desfaz a guarda',
    async (kind) => {
      const item = await subject();
      const session = await connection().startSession();
      try {
        session.startTransaction(transactionOptions);
        await guardProducerEligibility(connection(), item.guard, session);
        await Product.collection.findOne({ _id: item.product._id }, { session });
        if (kind === 'estado') {
          const outside = await Product.findById(item.product._id).orFail();
          outside.estadoPublicacao = 'arquivado';
          await outside.save();
        } else await decreaseProductStock(connection(), item.debit);
        let failure: unknown;
        try {
          await decreaseProductStock(connection(), item.debit, session);
        } catch (error) {
          failure = error;
        }
        expect(isMongoWriteConflict(failure)).toBe(true);
        await session.abortTransaction();
        expect(
          (await Producer.collection.findOne({ _id: item.producer._id }))?.revisaoOperacional,
        ).toBe(0);
        const product = await Product.collection.findOne({ _id: item.product._id });
        expect(product?.revisaoOperacional).toBe(1);
        expect(kind === 'estado' ? product?.estadoPublicacao : product?.stockDisponivel).toBe(
          kind === 'estado' ? 'arquivado' : 0,
        );
      } finally {
        await stop(session);
      }
    },
  );
  it('repetição explícita após alteração exige reler revisão e condições atuais', async () => {
    const item = await subject();
    const changed = await internalProducer(item.producer._id);
    changed.set('comercial.taxaEntregaCent', 350);
    await changed.save();
    const session = await connection().startSession();
    try {
      session.startTransaction(transactionOptions);
      await expect(
        guardProducerEligibility(connection(), item.guard, session),
      ).rejects.toMatchObject({ codigo: 'CONFIGURACAO_ALTERADA' });
      await session.abortTransaction();
      session.startTransaction(transactionOptions);
      const result = await guardProducerEligibility(
        connection(),
        {
          ...item.guard,
          revisaoEsperada: 1,
          selecao: { ...item.guard.selecao, taxaEntregaAceiteCent: 350 },
        },
        session,
      );
      expect(result.revisaoOperacional).toBe(2);
      await session.commitTransaction();
    } finally {
      await stop(session);
    }
  });
  it('sessão de outro cliente é recusada pelo driver antes de escrever', async () => {
    const item = await subject();
    const other = await connectDatabase(configuration);
    const session = await other.connection.startSession();
    try {
      session.startTransaction(transactionOptions);
      await expect(decreaseProductStock(connection(), item.debit, session)).rejects.toBeInstanceOf(
        mongo.MongoInvalidArgumentError,
      );
      expect((await Product.collection.findOne({ _id: item.product._id }))?.stockDisponivel).toBe(
        1,
      );
    } finally {
      await stop(session);
      await other.close();
    }
  });
});
