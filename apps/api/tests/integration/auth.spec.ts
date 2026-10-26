import { randomUUID } from 'node:crypto';
import { hash as bcryptHash } from 'bcryptjs';
import { mongo } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseEnvironment } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/database/connection.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import { createProductModel } from '../../src/modules/products/product.model.js';
import { createOrderModel } from '../../src/modules/orders/order.model.js';
import { createCheckoutService } from '../../src/modules/orders/checkout.service.js';
import { authConfiguration, registrationInput } from '../support/auth-fixtures.js';
import {
  checkoutScenario,
  checkoutTestNow,
  seedCheckoutScenario,
} from '../support/checkout-fixtures.js';
import { userInput } from '../support/identity-fixtures.js';

let database: Awaited<ReturnType<typeof connectDatabase>> | undefined;
const config = authConfiguration();
function connection() {
  if (!database) throw Error('Test database missing');
  return database.connection;
}
function auth() {
  return createAuthService(connection(), config);
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
  for (const model of [
    createUserModel(connection()),
    createProducerModel(connection()),
    createProductModel(connection()),
    createOrderModel(connection()),
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

describe('persistência de autenticação com MongoDB real', () => {
  it('registos simultâneos com o mesmo email resultam numa única conta e resposta genérica', async () => {
    const service = auth();
    const input = registrationInput();
    const results = await Promise.all(Array.from({ length: 4 }, () => service.register(input)));
    for (const result of results) expect(result).toEqual(results[0]);
    const User = createUserModel(connection());
    expect(await User.countDocuments({ emailNormalizado: input.email })).toBe(1);
    expect((await User.findOne({ emailNormalizado: input.email }).orFail()).papeis).toEqual([
      'comprador',
    ]);
  });
  it('email duplicado normalizado não substitui nome, papéis, password ou revisão', async () => {
    const service = auth();
    const input = registrationInput();
    await service.register(input);
    const before = await connection()
      .db!.collection('users')
      .findOne({ emailNormalizado: input.email });
    await service.register({
      ...input,
      nome: 'Outra identidade',
      email: input.email.toUpperCase(),
      password: 'Outra frase fictícia diferente!',
    });
    expect(
      await connection().db!.collection('users').findOne({ emailNormalizado: input.email }),
    ).toEqual(before);
  });
  it.each(['2a', '2b', '2y'])(
    'autentica bcrypt legado %s sem migração silenciosa ou necessidade do campo ativo',
    async (prefix) => {
      const password = 'senha antiga';
      const original = await bcryptHash(password, 10);
      const User = createUserModel(connection());
      const user = await User.create(
        userInput({
          emailNormalizado: randomUUID() + '@example.invalid',
          passwordHash: '$' + prefix + original.slice(3),
        }),
      );
      await User.collection.updateOne(
        { _id: user._id },
        { $unset: { ativo: '', revisaoOperacional: '' } },
      );
      const before = await User.collection.findOne({ _id: user._id });
      const login = await auth().login({ email: user.emailNormalizado, password });
      expect((await auth().authenticate(login.accessToken)).id).toBe(user._id.toHexString());
      expect(await User.collection.findOne({ _id: user._id })).toEqual(before);
    },
  );
  it('JWT válido continua sem acesso se a conta foi removida na base de teste', async () => {
    const input = registrationInput();
    const service = auth();
    await service.register(input);
    const login = await service.login(input);
    await createUserModel(connection()).collection.deleteOne({ emailNormalizado: input.email });
    await expect(service.authenticate(login.accessToken)).rejects.toMatchObject({ status: 401 });
  });
  it('desativação participa no CAS de users, sem permitir que um save antigo reative a conta', async () => {
    const input = registrationInput();
    const service = auth();
    await service.register(input);
    const User = createUserModel(connection());
    const stale = await User.findOne({ emailNormalizado: input.email })
      .select('+passwordHash')
      .orFail();
    const fresh = await User.findById(stale._id).select('+passwordHash').orFail();
    fresh.ativo = false;
    await fresh.save();
    stale.nome = 'Nome antigo alterado';
    await expect(stale.save()).rejects.toMatchObject({ codigo: 'CONFLITO_VERSAO' });
    expect((await User.findById(stale._id).orFail()).ativo).toBe(false);
  });
  it.each(['comprador', 'produtor'] as const)(
    'checkout não aceita conta %s desativada',
    async (role) => {
      const scenario = await seedCheckoutScenario(connection(), checkoutScenario());
      const user = await createUserModel(connection())
        .findById(role === 'comprador' ? scenario.buyerId : scenario.producers[0]!.userId)
        .select('+passwordHash')
        .orFail();
      user.ativo = false;
      await user.save();
      const checkout = createCheckoutService({
        connection: connection(),
        resolveIdentity: async () => ({ compradorContaId: scenario.buyerId.toHexString() }),
        now: () => checkoutTestNow,
      });
      expect((await checkout(scenario.chave, scenario.pedido)).tipo).toBe('recusado');
      expect(
        await createOrderModel(connection()).countDocuments({ comprador: scenario.buyerId }),
      ).toBe(0);
      expect(
        (await createProductModel(connection()).findById(scenario.products[0]!._id).orFail())
          .stockDisponivel,
      ).toBe(10_000);
    },
  );
  it('desativação concorrente com checkout provoca rollback integral', async () => {
    const scenario = await seedCheckoutScenario(connection(), checkoutScenario(2));
    const original = mongo.Collection.prototype.findOne;
    let armed = true;
    vi.spyOn(mongo.Collection.prototype, 'findOne').mockImplementation(async function (
      this: mongo.Collection,
      ...args
    ) {
      const result = await original.apply(this, args);
      if (armed && this.collectionName === 'products' && args[1]?.session) {
        armed = false;
        const user = await createUserModel(connection())
          .findById(scenario.buyerId)
          .select('+passwordHash')
          .orFail();
        user.ativo = false;
        await user.save();
      }
      return result;
    });
    const checkout = createCheckoutService({
      connection: connection(),
      resolveIdentity: async () => ({ compradorContaId: scenario.buyerId.toHexString() }),
      now: () => checkoutTestNow,
    });
    expect((await checkout(scenario.chave, scenario.pedido)).tipo).toBe('recusado');
    expect(
      await createOrderModel(connection()).countDocuments({ comprador: scenario.buyerId }),
    ).toBe(0);
    for (const p of scenario.products) {
      const stored = await createProductModel(connection()).findById(p._id).orFail();
      expect(stored.stockDisponivel).toBe(10_000);
      expect(stored.revisaoOperacional).toBe(0);
    }
  });
});
