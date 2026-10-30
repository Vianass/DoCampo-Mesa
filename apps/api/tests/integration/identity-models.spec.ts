import { randomUUID } from 'node:crypto';
import type { Model } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/database/connection.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import type { ProducerRecord } from '../../src/modules/producers/producer.model.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import type { UserRecord } from '../../src/modules/users/user.model.js';
import {
  decisionInput,
  producerInput,
  testPasswordHash,
  userInput,
} from '../support/identity-fixtures.js';

const configuration = parseEnvironment({
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
  MONGODB_DB_NAME: `docampo_test_${randomUUID().replaceAll('-', '')}`,
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: '2000',
});
let database: Awaited<ReturnType<typeof connectDatabase>> | undefined;
let User: Model<UserRecord>;
let Producer: Model<ProducerRecord>;
let sequence = 0;

beforeAll(async () => {
  database = await connectDatabase(configuration);
  const hello = await database.connection.db!.admin().command({ hello: 1 });
  expect(hello.setName).toBe('rs-dcm-test');
  expect(hello.isWritablePrimary).toBe(true);
  User = createUserModel(database.connection);
  Producer = createProducerModel(database.connection);
  // Sem autoIndex, syncIndexes, .env ou reutilização de bases de desenvolvimento.
  await User.createCollection();
  await Producer.createCollection();
  await User.createIndexes();
  await Producer.createIndexes();
});

afterAll(async () => {
  if (!database) return;
  try {
    await database.connection.dropDatabase();
  } finally {
    await database.close();
  }
});

function newAccount(overrides: Record<string, unknown> = {}) {
  sequence++;
  return User.create(
    userInput({ emailNormalizado: `conta-${sequence}@example.invalid`, ...overrides }),
  );
}

describe('users/producers em MongoDB real e isolado', () => {
  it('regista os dois modelos e os índices únicos e de consulta aprovados', async () => {
    expect(database!.connection.modelNames().sort()).toEqual(['ProducerProfile', 'User']);
    const users = await User.listIndexes();
    const producers = await Producer.listIndexes();
    expect(users).toHaveLength(4);
    expect(users).toContainEqual(expect.objectContaining({ key: { createdAt: -1, _id: 1 } }));
    expect(users).toContainEqual(
      expect.objectContaining({ key: { papeis: 1, ativo: 1, createdAt: -1, _id: 1 } }),
    );
    expect(producers).toHaveLength(3);
    expect(producers).toContainEqual(
      expect.objectContaining({
        key: { 'aprovacao.estado': 1, 'aprovacao.submetidaEm': -1, _id: 1 },
      }),
    );
    expect(users).toContainEqual(
      expect.objectContaining({ key: { emailNormalizado: 1 }, unique: true }),
    );
    expect(producers).toContainEqual(expect.objectContaining({ key: { userId: 1 }, unique: true }));
    const collections = await database!.connection.db!.listCollections().toArray();
    expect(collections.map((item) => item.name).sort()).toEqual(['producers', 'users']);
  });

  it('persiste email normalizado, papéis acumulados e timestamps sem expor o hash', async () => {
    const created = await newAccount({ emailNormalizado: '  PERSISTENCIA@EXAMPLE.INVALID  ' });
    const read = await User.findById(created._id).orFail();
    expect(read.emailNormalizado).toBe('persistencia@example.invalid');
    expect(read.papeis).toEqual(['comprador', 'produtor']);
    expect(read.createdAt).toBeInstanceOf(Date);
    expect(read.updatedAt).toBeInstanceOf(Date);
    expect(read.passwordHash).toBeUndefined();
    const lean = await User.findById(created._id).lean().orFail();
    expect(lean).not.toHaveProperty('passwordHash');
    const privateRead = await User.findById(created._id).select('+passwordHash').orFail();
    expect(privateRead.passwordHash).toBe(testPasswordHash);
    expect(privateRead.toJSON()).not.toHaveProperty('passwordHash');
    expect(privateRead.toObject()).not.toHaveProperty('passwordHash');
    // A leitura privada não precisa de voltar a carregar o hash para guardar outro campo.
    read.nome = 'Nome de teste atualizado';
    await read.save();
    expect((await User.findById(read._id).orFail()).nome).toBe('Nome de teste atualizado');
  });

  it('recusa emails equivalentes sob concorrência pelo índice, sem consulta prévia', async () => {
    const results = await Promise.allSettled([
      newAccount({ emailNormalizado: '  CONCORRENTE@EXAMPLE.INVALID ' }),
      newAccount({ emailNormalizado: 'concorrente@example.invalid' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((result) => result.status === 'rejected');
    expect(failure?.status === 'rejected' && failure.reason).toMatchObject({ code: 11000 });
    expect(await User.countDocuments({ emailNormalizado: 'concorrente@example.invalid' })).toBe(1);
  });

  it('revalida email e hash ao guardar um documento alterado', async () => {
    const first = await newAccount();
    const second = await newAccount();
    second.emailNormalizado = first.emailNormalizado.toUpperCase();
    await expect(second.save()).rejects.toMatchObject({ code: 11000 });
    const privateRead = await User.findById(first._id).select('+passwordHash').orFail();
    privateRead.passwordHash = 'texto-simples-nao-permitido';
    await expect(privateRead.save()).rejects.toMatchObject({ name: 'ValidationError' });
    expect((await User.findById(first._id).select('+passwordHash').orFail()).passwordHash).toBe(
      testPasswordHash,
    );
  });

  it('não persiste campos inválidos, password em claro ou papéis desconhecidos', async () => {
    const count = await User.countDocuments();
    await expect(newAccount({ passwordHash: 'nao-guardar' })).rejects.toMatchObject({
      name: 'ValidationError',
    });
    await expect(newAccount({ papeis: ['visitante'] })).rejects.toMatchObject({
      name: 'ValidationError',
    });
    await expect(newAccount({ nome: undefined })).rejects.toMatchObject({
      name: 'ValidationError',
    });
    expect(await User.countDocuments()).toBe(count);
  });

  it('persiste perfil pendente e lê o responsável da conta, sem duplicar o nome', async () => {
    const account = await newAccount();
    const created = await Producer.create(producerInput({ userId: account._id }));
    const read = await Producer.findById(created._id).populate('userId', 'nome').orFail();
    expect(read.get('nomeResponsavel')).toBe(account.nome);
    expect(read.aprovacao.estado).toBe('pendente');
    expect(read.aprovacao.decisao).toBeUndefined();
    expect(read.aprovacao.submetidaEm).toBeInstanceOf(Date);
    expect(read.createdAt).toBeInstanceOf(Date);
    expect(read.updatedAt).toBeInstanceOf(Date);
    expect(read.telefone).toBeUndefined();
    expect(read.toJSON().userId.toString()).toBe(account._id.toString());
    expect(read.toJSON()).not.toHaveProperty('passwordHash');
    const stored = await Producer.collection.findOne({ _id: created._id });
    expect(stored).not.toHaveProperty('nomeResponsavel');
    expect(stored).not.toHaveProperty('passwordHash');
    account.nome = 'Responsável de teste atualizado';
    await account.save();
    const updated = await Producer.findById(created._id).populate('userId', 'nome').orFail();
    expect(updated.get('nomeResponsavel')).toBe('Responsável de teste atualizado');
    expect(JSON.stringify(updated)).not.toContain('emailNormalizado');
  });

  it('impede dois perfis da mesma conta sob concorrência', async () => {
    const account = await newAccount();
    const results = await Promise.allSettled([
      Producer.create(producerInput({ userId: account._id })),
      Producer.create(producerInput({ userId: account._id })),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((result) => result.status === 'rejected');
    expect(failure?.status === 'rejected' && failure.reason).toMatchObject({ code: 11000 });
    expect(await Producer.countDocuments({ userId: account._id })).toBe(1);
  });

  it('não permite trocar a conta proprietária com save', async () => {
    const first = await newAccount();
    const second = await newAccount();
    const profile = await Producer.create(producerInput({ userId: first._id }));
    profile.userId = second._id;
    await expect(profile.save()).rejects.toMatchObject({ name: 'ValidationError' });
    expect((await Producer.findById(profile._id).orFail()).userId.toString()).toBe(
      first._id.toString(),
    );
  });

  it('persiste documentos aprovados/rejeitados com decisão coerente e protege campos privados', async () => {
    // Administrador exclusivamente fictício, na base efémera desta suite; sem conta real ou endpoint.
    const administrator = await newAccount({ papeis: ['administrador'] });
    for (const estado of ['aprovado', 'rejeitado']) {
      const account = await newAccount();
      const created = await Producer.create(
        producerInput({
          userId: account._id,
          aprovacao: decisionInput({
            estado,
            decisao: {
              autor: administrator._id,
              data: new Date('2026-10-11T09:00:00Z'),
              justificacao: 'Justificação fictícia de teste.',
            },
          }),
        }),
      );
      const read = await Producer.findById(created._id).orFail();
      expect(read.aprovacao.estado).toBe(estado);
      expect(read.aprovacao.decisao?.autor).toBeUndefined();
      const privateRead = await Producer.findById(created._id)
        .select('+telefone +aprovacao.decisao.autor')
        .orFail();
      expect(privateRead.telefone).toBe('+351 000 000 000');
      expect(privateRead.aprovacao.decisao?.autor.toString()).toBe(administrator._id.toString());
      expect(privateRead.toJSON()).not.toHaveProperty('telefone');
      expect(privateRead.toJSON().aprovacao.decisao).not.toHaveProperty('autor');
    }
  });

  it('não persiste candidatura inconsistente nem estado desconhecido', async () => {
    const account = await newAccount();
    const count = await Producer.countDocuments();
    for (const aprovacao of [
      decisionInput({ estado: 'pendente' }),
      decisionInput({ estado: 'rejeitado' }),
      decisionInput({ decisao: undefined }),
      { estado: 'suspenso' },
    ]) {
      await expect(
        Producer.create(producerInput({ userId: account._id, aprovacao })),
      ).rejects.toMatchObject({ name: 'ValidationError' });
    }
    expect(await Producer.countDocuments()).toBe(count);
  });

  it('revalida alterações de decisão antes de save sem guardar resultados parciais', async () => {
    const account = await newAccount();
    const profile = await Producer.create(producerInput({ userId: account._id }));
    profile.aprovacao.estado = 'aprovado';
    await expect(profile.save()).rejects.toMatchObject({ name: 'ValidationError' });
    expect((await Producer.findById(profile._id).orFail()).aprovacao.estado).toBe('pendente');
  });

  it('recusa escritas parciais/bulk e desativação explícita da validação', async () => {
    const account = await newAccount();
    const profile = await Producer.create(producerInput({ userId: account._id }));
    await expect(
      User.updateOne({ _id: account._id }, { passwordHash: 'nao-guardar' }),
    ).rejects.toThrow('save');
    await expect(
      Producer.findByIdAndUpdate(profile._id, { 'aprovacao.estado': 'aprovado' }),
    ).rejects.toThrow('save');
    await expect(
      User.bulkWrite([
        { updateOne: { filter: { _id: account._id }, update: { passwordHash: 'nao-guardar' } } },
      ]),
    ).rejects.toThrow('bulk');
    await expect(
      User.insertMany([userInput({ passwordHash: 'nao-guardar' })], { lean: true }),
    ).rejects.toThrow('bulk');
    const modifiedOnly = await Producer.findById(profile._id).orFail();
    modifiedOnly.nomePublico = 'Nome de teste alterado';
    await expect(modifiedOnly.save({ validateModifiedOnly: true })).rejects.toThrow(
      'sem validação',
    );
    const invalid = new User(userInput({ nome: undefined }));
    await expect(invalid.save({ validateBeforeSave: false })).rejects.toThrow('sem validação');
    expect((await Producer.findById(profile._id).orFail()).aprovacao.estado).toBe('pendente');
  });

  it('não confunde uma referência Mongoose com uma chave estrangeira ou autorização', async () => {
    const account = await newAccount();
    const profile = await Producer.create(producerInput({ userId: account._id }));
    // Prova explícita do limite: o serviço futuro terá de impedir referências órfãs.
    await User.deleteOne({ _id: account._id });
    const read = await Producer.findById(profile._id).populate('userId', 'nome').orFail();
    expect(read.userId).toBeNull();
    expect(read.get('nomeResponsavel')).toBeUndefined();
  });
});
