import { randomUUID } from 'node:crypto';
import type { Model } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/database/connection.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import type { ProducerRecord } from '../../src/modules/producers/producer.model.js';
import { assessProducerCommercial } from '../../src/modules/producers/producer-commercial.validation.js';
import { projectProducerPublic } from '../../src/modules/producers/producer.serialization.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import type { UserRecord } from '../../src/modules/users/user.model.js';
import { createProductModel } from '../../src/modules/products/product.model.js';
import { userInput, producerInput, decisionInput } from '../support/identity-fixtures.js';
import { publishedProductInput } from '../support/product-fixtures.js';
import {
  fictitiousProducerIban,
  fictitiousMbWayContact,
  pickupCommercialInput,
  producerCommercialInput,
} from '../support/producer-commercial-fixtures.js';

const configuration = parseEnvironment({
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
  MONGODB_DB_NAME: `docampo_test_${randomUUID().replaceAll('-', '')}`,
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: '2000',
});
let database: Awaited<ReturnType<typeof connectDatabase>> | undefined;
let Producer: Model<ProducerRecord>;
let User: Model<UserRecord>;
let sequence = 0;
beforeAll(async () => {
  database = await connectDatabase(configuration);
  const hello = await database.connection.db!.admin().command({ hello: 1 });
  expect(hello.setName).toBe('rs-dcm-test');
  expect(hello.isWritablePrimary).toBe(true);
  const info = await database.connection.db!.admin().command({ buildInfo: 1 });
  expect(info.version).toBe('8.0.34');
  User = createUserModel(database.connection);
  Producer = createProducerModel(database.connection);
  for (const model of [User, Producer]) {
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

async function profile(overrides: Record<string, unknown> = {}) {
  sequence++;
  const account = await User.create(
    userInput({
      emailNormalizado: `produtor-comercial-${sequence}@example.invalid`,
      papeis: ['produtor'],
    }),
  );
  return Producer.create(producerInput({ userId: account._id, ...overrides }));
}
function internal(id: ProducerRecord['_id']) {
  return Producer.findById(id)
    .select('+telefone +aprovacao.decisao.autor +comercial.pagamentoPrivado')
    .orFail();
}

describe('configuração comercial em MongoDB real', () => {
  it('mantém os modelos, coleções e índices originais, sem coleção comercial adicional', async () => {
    expect(database!.connection.modelNames().sort()).toEqual(['ProducerProfile', 'User']);
    expect(
      (await database!.connection.db!.listCollections().toArray()).map((item) => item.name).sort(),
    ).toEqual(['producers', 'users']);
    expect(await Producer.listIndexes()).toHaveLength(2);
    expect(await Producer.listIndexes()).toContainEqual(
      expect.objectContaining({ key: { userId: 1 }, unique: true }),
    );
  });

  it('cria e relê produtor antigo sem configuração nem valores inventados', async () => {
    const created = await profile();
    const read = await internal(created._id);
    await expect(read.validate()).resolves.toBeUndefined();
    expect(read.comercial).toBeUndefined();
    expect(await Producer.collection.findOne({ _id: created._id })).not.toHaveProperty('comercial');
    expect(assessProducerCommercial(read).prontoLocalmente).toBe(false);
  });

  it('persiste modalidades, taxa, IDs, horários, métodos e dados privados', async () => {
    const created = await profile({ comercial: producerCommercialInput() });
    const read = await internal(created._id);
    expect(read.comercial?.modalidades).toMatchObject({ levantamento: true, entrega: true });
    expect(read.comercial?.taxaEntregaCent).toBe(250);
    expect(read.comercial?.concelhosEntregaIds).toEqual([
      'concelho-ficticio-001',
      'concelho-ficticio-002',
    ]);
    expect(read.comercial?.disponibilidade.fusoHorario).toBe('Europe/Lisbon');
    expect(read.comercial?.disponibilidade.entrega[0]).toMatchObject({
      diaSemana: 1,
      inicio: '14:00',
      fim: '18:00',
    });
    expect(read.comercial?.metodosPagamento).toEqual([
      'dinheiro',
      'mb_way',
      'transferencia_bancaria',
    ]);
    expect(read.comercial?.pagamentoPrivado?.transferenciaBancaria?.iban).toBe(
      fictitiousProducerIban,
    );
  });

  it('levantamento exclusivo não cria taxa nem cobertura de entrega', async () => {
    const created = await profile({ comercial: pickupCommercialInput() });
    const read = await internal(created._id);
    expect(read.comercial?.taxaEntregaCent).toBeUndefined();
    expect(read.comercial?.concelhosEntregaIds).toEqual([]);
    expect(read.comercial?.disponibilidade.entrega).toHaveLength(0);
    expect(read.comercial?.modalidades.entrega).toBe(false);
  });

  it('entrega exclusiva aceita taxa zero explícita', async () => {
    const created = await profile({
      comercial: producerCommercialInput({
        modalidades: { levantamento: false, entrega: true },
        taxaEntregaCent: 0,
      }),
    });
    expect((await internal(created._id)).comercial?.taxaEntregaCent).toBe(0);
  });

  it.each(['pendente', 'aprovado', 'rejeitado'] as const)(
    'perfil %s antigo continua válido e não é ativado comercialmente',
    async (estado) => {
      const aprovacao =
        estado === 'pendente'
          ? undefined
          : decisionInput({
              estado,
              decisao: { ...decisionInput().decisao, justificacao: 'Decisão fictícia' },
            });
      const created = await profile(aprovacao === undefined ? {} : { aprovacao });
      const read = await internal(created._id);
      await read.validate();
      expect(read.aprovacao.estado).toBe(estado);
      expect(read.comercial).toBeUndefined();
      expect(assessProducerCommercial(read)).toMatchObject({
        configurado: false,
        prontoLocalmente: false,
      });
    },
  );

  it('adiciona configuração a perfil aprovado sem modificar IDs ou aprovação', async () => {
    const created = await profile({ aprovacao: decisionInput() });
    const original = created.toObject({ transform: false });
    const read = await internal(created._id);
    read.set('comercial', producerCommercialInput());
    await read.save();
    const persisted = await internal(created._id);
    expect(persisted._id.equals(created._id)).toBe(true);
    expect(persisted.userId.equals(created.userId)).toBe(true);
    expect(persisted.toObject({ transform: false }).aprovacao).toEqual(original.aprovacao);
    expect(assessProducerCommercial(persisted)).toEqual({
      aprovado: true,
      configurado: true,
      prontoLocalmente: true,
    });
  });

  it('atualiza taxa, concelhos e horários sem apagar dados privados', async () => {
    const created = await profile({ comercial: producerCommercialInput() });
    const read = await internal(created._id);
    read.set('comercial.taxaEntregaCent', 350);
    read.set('comercial.concelhosEntregaIds', ['novo-id-ficticio']);
    read.set('comercial.disponibilidade.entrega', [
      { diaSemana: 2, inicio: '15:00', fim: '17:00' },
    ]);
    await read.save();
    const persisted = await internal(created._id);
    expect(persisted.comercial?.taxaEntregaCent).toBe(350);
    expect(persisted.comercial?.concelhosEntregaIds).toEqual(['novo-id-ficticio']);
    expect(persisted.comercial?.pagamentoPrivado?.transferenciaBancaria?.iban).toBe(
      fictitiousProducerIban,
    );
  });

  it.each([
    { taxaEntregaCent: -1 },
    { taxaEntregaCent: 0.1 },
    { taxaEntregaCent: Number.MAX_SAFE_INTEGER + 1 },
    { modalidades: { levantamento: false, entrega: false } },
    { concelhosEntregaIds: ['id', 'id'] },
    { metodosPagamento: ['cartao'] },
  ])('não persiste configuração inválida %#', async (overrides) => {
    const document = await profile();
    const before = await Producer.collection.findOne({ _id: document._id });
    document.set('comercial', { ...producerCommercialInput(), ...overrides });
    await expect(document.save()).rejects.toMatchObject({ name: 'ValidationError' });
    expect(await Producer.collection.findOne({ _id: document._id })).toEqual(before);
  });

  it('rejeita sobreposição na atualização e mantém os períodos anteriores', async () => {
    const created = await profile({ comercial: producerCommercialInput() });
    const read = await internal(created._id);
    read.set('comercial.disponibilidade.entrega', [
      { diaSemana: 1, inicio: '14:00', fim: '18:00' },
      { diaSemana: 1, inicio: '17:00', fim: '19:00' },
    ]);
    await expect(read.save()).rejects.toMatchObject({ name: 'ValidationError' });
    expect((await internal(created._id)).comercial?.disponibilidade.entrega).toHaveLength(1);
  });

  it('pode remover explicitamente a configuração sem invalidar o perfil antigo', async () => {
    const created = await profile({
      aprovacao: decisionInput(),
      comercial: producerCommercialInput(),
    });
    const read = await internal(created._id);
    read.set('comercial', undefined);
    await read.save();
    const persisted = await internal(created._id);
    expect(persisted.aprovacao.estado).toBe('aprovado');
    expect(persisted.comercial).toBeUndefined();
    expect(assessProducerCommercial(persisted).prontoLocalmente).toBe(false);
  });

  it('leituras normais/lean omitem dados de pagamento por omissão', async () => {
    const created = await profile({ comercial: producerCommercialInput() });
    expect(
      (await Producer.findById(created._id).orFail()).comercial?.pagamentoPrivado,
    ).toBeUndefined();
    const lean = await Producer.findById(created._id).lean().orFail();
    expect(lean.comercial).not.toHaveProperty('pagamentoPrivado');
    expect(lean).not.toHaveProperty('telefone');
    expect(lean.comercial?.taxaEntregaCent).toBe(250);
  });

  it('JSON/toObject anteriores e projeção pública são seguros mesmo após seleção privada explícita', async () => {
    const created = await profile({
      aprovacao: decisionInput(),
      comercial: producerCommercialInput(),
    });
    const read = await internal(created._id);
    const raw = read.toObject({ transform: false });
    expect(raw.comercial?.pagamentoPrivado?.transferenciaBancaria?.iban).toBe(
      fictitiousProducerIban,
    );
    for (const value of [read.toJSON(), read.toObject(), projectProducerPublic(raw)]) {
      const text = JSON.stringify(value);
      for (const secret of [
        fictitiousProducerIban,
        fictitiousMbWayContact,
        'pagamentoPrivado',
        'telefone',
        'autor',
      ])
        expect(text).not.toContain(secret);
    }
    expect(read.toJSON()).not.toHaveProperty('comercial');
    expect(projectProducerPublic(raw)).toHaveProperty('comercial');
  });

  it('lean com seleção privilegiada exige a projeção explícita antes de apresentação', async () => {
    const created = await profile({ comercial: producerCommercialInput() });
    const lean = await Producer.findById(created._id)
      .select('+telefone +comercial.pagamentoPrivado')
      .lean()
      .orFail();
    expect(lean.comercial?.pagamentoPrivado?.transferenciaBancaria?.iban).toBe(
      fictitiousProducerIban,
    );
    expect(JSON.stringify(projectProducerPublic(lean))).not.toContain(fictitiousProducerIban);
  });

  it('populate não transforma a conta num perfil público nem expõe contactos de pagamento', async () => {
    const created = await profile({ comercial: producerCommercialInput() });
    const read = await Producer.findById(created._id)
      .select('+comercial.pagamentoPrivado')
      .populate('userId', '+passwordHash')
      .orFail();
    for (const value of [
      read.toJSON(),
      read.toObject(),
      projectProducerPublic(read.toObject({ transform: false })),
    ]) {
      const text = JSON.stringify(value);
      for (const field of [
        'emailNormalizado',
        'passwordHash',
        'papeis',
        'pagamentoPrivado',
        fictitiousProducerIban,
      ])
        expect(text).not.toContain(field);
    }
  });

  it.each([
    '+telefone',
    'nomePublico comercial.taxaEntregaCent',
    '+telefone +comercial.pagamentoPrivado -comercial.pagamentoPrivado.transferenciaBancaria.titular',
    '+telefone +comercial.pagamentoPrivado -comercial.disponibilidade.entrega.inicio',
  ])('impede edição comercial a partir de leitura incompleta %s', async (selection) => {
    const created = await profile({ comercial: producerCommercialInput() });
    const read = await Producer.findById(created._id).select(selection).orFail();
    expect(() => read.toJSON()).not.toThrow();
    read.set('comercial.taxaEntregaCent', 500);
    await expect(read.save()).rejects.toThrow('leitura completa');
    expect((await internal(created._id)).comercial?.taxaEntregaCent).toBe(250);
  });

  it('guarda uma alteração não comercial de perfil antigo sem migração comercial', async () => {
    const created = await profile();
    const read = await internal(created._id);
    read.nomePublico = 'Nome atualizado fictício';
    await read.save();
    const persisted = await internal(created._id);
    await persisted.validate();
    expect(persisted.comercial).toBeUndefined();
    expect(persisted.nomePublico).toBe('Nome atualizado fictício');
  });

  it('mantém as guardas existentes para updates parciais/bulk sem contornar a validação', async () => {
    const created = await profile({ comercial: producerCommercialInput() });
    await expect(
      Producer.updateOne({ _id: created._id }, { 'comercial.taxaEntregaCent': -1 }),
    ).rejects.toThrow('save');
    await expect(
      Producer.findOneAndUpdate({ _id: created._id }, { comercial: {} }),
    ).rejects.toThrow('save');
    await expect(Producer.insertMany([producerInput()])).rejects.toThrow('bulk');
  });

  it('não altera produtos ao configurar o produtor nem muda aprovação/identidade', async () => {
    const created = await profile({ aprovacao: decisionInput() });
    const Product = createProductModel(database!.connection);
    await Product.createCollection();
    await Product.createIndexes();
    const product = await Product.create(publishedProductInput({ produtor: created.userId }));
    const before = await Product.collection.findOne({ _id: product._id });
    const profileBefore = created.toObject({ transform: false });
    const read = await internal(created._id);
    read.set('comercial', producerCommercialInput());
    await read.save();
    expect(await Product.collection.findOne({ _id: product._id })).toEqual(before);
    const persisted = await internal(created._id);
    expect(persisted.toObject({ transform: false }).aprovacao).toEqual(profileBefore.aprovacao);
    expect(persisted.userId.equals(created.userId)).toBe(true);
  });
});
