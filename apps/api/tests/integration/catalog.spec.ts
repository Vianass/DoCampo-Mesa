import { randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { connectDatabase } from '../../src/database/connection.js';
import { parseEnvironment } from '../../src/config/environment.js';
import {
  catalogActor,
  catalogHarness,
  publishedCatalogProduct,
  productHttpInput,
} from '../support/catalog-fixtures.js';
import {
  productCreateSchema,
  productReplaceSchema,
} from '../../src/modules/catalog/catalog.validation.js';
import { createProductModel } from '../../src/modules/products/product.model.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import { createOrderModel } from '../../src/modules/orders/order.model.js';
import { decreaseProductStock } from '../../src/modules/products/product-stock.repository.js';
import { createCheckoutService } from '../../src/modules/orders/checkout.service.js';
import {
  checkoutScenario,
  checkoutTestNow,
  seedCheckoutScenario,
} from '../support/checkout-fixtures.js';
import type { AuthPrincipal } from '../../src/modules/auth/auth.service.js';
let database: Awaited<ReturnType<typeof connectDatabase>> | undefined;
let harness: Awaited<ReturnType<typeof catalogHarness>>;
function connection() {
  if (!database) throw Error('Test database missing');
  return database.connection;
}
beforeAll(async () => {
  database = await connectDatabase(
    parseEnvironment({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      MONGODB_DB_NAME: 'docampo_test_' + randomUUID().replaceAll('-', ''),
    }),
  );
  expect((await connection().db!.admin().command({ hello: 1 })).setName).toBe('rs-dcm-test');
  expect((await connection().db!.admin().command({ buildInfo: 1 })).version).toBe('8.0.34');
  harness = await catalogHarness(connection());
  const Order = createOrderModel(connection());
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
function principal(actor: Awaited<ReturnType<typeof catalogActor>>): AuthPrincipal {
  return {
    id: actor.user._id.toHexString(),
    nome: actor.user.nome,
    email: actor.user.emailNormalizado,
    papeis: ['produtor'],
  };
}
async function subject() {
  const actor = await catalogActor(connection());
  const product = await publishedCatalogProduct(connection(), actor);
  return { actor, product, user: principal(actor) };
}

describe('gestão concorrente com MongoDB real', () => {
  it('duas substituições com o mesmo ETag não sobrepõem alterações', async () => {
    const { actor, product, user } = await subject();
    const tag = harness.catalog.tag(product);
    const inputs = ['Primeira alteração', 'Segunda alteração'].map((nome) =>
      productReplaceSchema.parse({ ...productHttpInput({ nome }), estadoPublicacao: 'publicado' }),
    );
    const results = await Promise.allSettled(
      inputs.map((input) => harness.catalog.replace(user, product._id.toHexString(), input, tag)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason.status).toBe(412);
    expect(
      (await createProductModel(connection()).findById(product._id).orFail()).revisaoOperacional,
    ).toBe(1);
    expect(
      (await createProducerModel(connection()).findById(actor.producer._id).orFail())
        .revisaoOperacional,
    ).toBe(1);
  });
  it('ETag anterior ao débito de stock impede repor stock por edição antiga', async () => {
    const { product, user } = await subject();
    const tag = harness.catalog.tag(product);
    await decreaseProductStock(connection(), {
      produtoId: product._id,
      produtorId: product.produtor,
      revisaoEsperada: 0,
      quantidade: 500,
      precoAceiteCent: 150,
      unidadeAceite: {
        modalidade: 'peso',
        unidadeBase: 'g',
        quantidadeReferencia: 1000,
        quantidadeMinima: 250,
        incrementoCompra: 50,
      },
    });
    await expect(
      harness.catalog.replace(
        user,
        product._id.toHexString(),
        productReplaceSchema.parse({ ...productHttpInput(), estadoPublicacao: 'publicado' }),
        tag,
      ),
    ).rejects.toMatchObject({ status: 412 });
    expect(
      (await createProductModel(connection()).findById(product._id).orFail()).stockDisponivel,
    ).toBe(9500);
  });
  it('falha depois da inserção real reverte produto e guardas', async () => {
    const actor = await catalogActor(connection());
    const beforeUser = await createUserModel(connection()).collection.findOne({
      _id: actor.user._id,
    });
    const beforeProfile = await createProducerModel(connection()).collection.findOne({
      _id: actor.producer._id,
    });
    const original = mongo.Collection.prototype.insertOne;
    const failure = Error('Falha fictícia após escrita');
    vi.spyOn(mongo.Collection.prototype, 'insertOne').mockImplementation(async function (
      this: mongo.Collection,
      ...args
    ) {
      const result = await original.apply(this, args);
      if (this.collectionName === 'products') throw failure;
      return result;
    });
    await expect(
      harness.catalog.create(
        principal(actor),
        productCreateSchema.parse({ nome: 'Não confirmar' }),
      ),
    ).rejects.toBe(failure);
    expect(
      await createProductModel(connection()).countDocuments({ produtor: actor.user._id }),
    ).toBe(0);
    expect(await createUserModel(connection()).collection.findOne({ _id: actor.user._id })).toEqual(
      beforeUser,
    );
    expect(
      await createProducerModel(connection()).collection.findOne({ _id: actor.producer._id }),
    ).toEqual(beforeProfile);
  });
  it('aprovação retirada entre leitura e guarda impede confirmar edição', async () => {
    const { actor, product, user } = await subject();
    let armed = true;
    const original = mongo.Collection.prototype.findOneAndUpdate;
    vi.spyOn(mongo.Collection.prototype, 'findOneAndUpdate').mockImplementation(async function (
      this: mongo.Collection,
      ...args
    ) {
      if (armed && this.collectionName === 'producers') {
        armed = false;
        const profile = await createProducerModel(connection())
          .findById(actor.producer._id)
          .select('+telefone +aprovacao.decisao.autor +comercial.pagamentoPrivado')
          .orFail();
        profile.set('aprovacao', {
          estado: 'pendente',
          submetidaEm: new Date('2026-10-01T10:00:00Z'),
        });
        await profile.save();
      }
      return original.apply(this, args);
    });
    await expect(
      harness.catalog.replace(
        user,
        product._id.toHexString(),
        productReplaceSchema.parse({
          ...productHttpInput({ precoCent: 200 }),
          estadoPublicacao: 'publicado',
        }),
        harness.catalog.tag(product),
      ),
    ).rejects.toMatchObject({ status: 403 });
    const stored = await createProductModel(connection()).findById(product._id).orFail();
    expect(stored.precoCent).toBe(150);
    expect(stored.revisaoOperacional).toBe(0);
    expect(
      (await createUserModel(connection()).findById(actor.user._id).orFail()).revisaoOperacional,
    ).toBe(0);
  });
  it('revogação concorrente da capacidade produtor provoca rollback', async () => {
    const { actor, product, user } = await subject();
    let armed = true;
    const original = mongo.Collection.prototype.findOne;
    vi.spyOn(mongo.Collection.prototype, 'findOne').mockImplementation(async function (
      this: mongo.Collection,
      ...args
    ) {
      const result = await original.apply(this, args);
      if (armed && this.collectionName === 'products' && args[1]?.session) {
        armed = false;
        const account = await createUserModel(connection())
          .findById(actor.user._id)
          .select('+passwordHash')
          .orFail();
        account.papeis = ['comprador'];
        await account.save();
      }
      return result;
    });
    await expect(
      harness.catalog.replace(
        user,
        product._id.toHexString(),
        productReplaceSchema.parse({ ...productHttpInput(), estadoPublicacao: 'publicado' }),
        harness.catalog.tag(product),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await createProductModel(connection()).findById(product._id).orFail()).revisaoOperacional,
    ).toBe(0);
  });
  it('retry transitório usa o mesmo ID e confirma apenas um produto e uma guarda', async () => {
    const actor = await catalogActor(connection());
    const original = mongo.Collection.prototype.insertOne;
    const ids: string[] = [];
    let failed = false;
    vi.spyOn(mongo.Collection.prototype, 'insertOne').mockImplementation(async function (
      this: mongo.Collection,
      ...args
    ) {
      if (this.collectionName === 'products') ids.push(String(args[0]._id));
      const result = await original.apply(this, args);
      if (!failed && this.collectionName === 'products') {
        failed = true;
        throw new mongo.MongoServerError({ code: 112, errorLabels: ['TransientTransactionError'] });
      }
      return result;
    });
    await harness.catalog.create(
      principal(actor),
      productCreateSchema.parse({ nome: 'Repetição segura' }),
    );
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    expect(
      await createProductModel(connection()).countDocuments({ produtor: actor.user._id }),
    ).toBe(1);
    expect(
      (await createUserModel(connection()).findById(actor.user._id).orFail()).revisaoOperacional,
    ).toBe(1);
  });
  it('arquivo preserva encomenda real criada pelo checkout e os seus snapshots', async () => {
    const scenario = await seedCheckoutScenario(connection(), checkoutScenario());
    const checkout = createCheckoutService({
      connection: connection(),
      resolveIdentity: async () => ({ compradorContaId: scenario.buyerId.toHexString() }),
      now: () => checkoutTestNow,
    });
    expect((await checkout(scenario.chave, scenario.pedido)).tipo).toBe('sucesso');
    const Order = createOrderModel(connection());
    const before = await Order.collection.findOne({ produtor: scenario.producers[0]!.userId });
    const producerId = scenario.producers[0]!.userId.toHexString();
    const product = await createProductModel(connection())
      .findById(scenario.products[0]!._id)
      .orFail();
    await harness.catalog.archive(
      {
        id: producerId,
        nome: 'Produtor fictício',
        email: 'ficticio@example.invalid',
        papeis: ['produtor'],
      },
      product._id.toHexString(),
      harness.catalog.tag(product),
    );
    expect(await Order.collection.findOne({ _id: before!._id })).toEqual(before);
    expect(
      (await createProductModel(connection()).findById(product._id).orFail()).estadoPublicacao,
    ).toBe('arquivado');
  });
  it('perfil pendente sem configuração comercial prepara rascunho sem inventar condições', async () => {
    const actor = await catalogActor(connection(), 'pendente');
    actor.producer.set('comercial', undefined);
    await actor.producer.save();
    const item = await harness.catalog.create(
      principal(actor),
      productCreateSchema.parse({ nome: 'Rascunho inicial' }),
    );
    expect(item.estadoPublicacao).toBe('rascunho');
  });
});
