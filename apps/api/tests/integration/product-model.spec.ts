import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/database/connection.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import type {
  ApplicationStatus,
  ProducerRecord,
} from '../../src/modules/producers/producer.model.js';
import { createProductModel } from '../../src/modules/products/product.model.js';
import type { ProductRecord } from '../../src/modules/products/product.types.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import type { UserRecord, UserRole } from '../../src/modules/users/user.model.js';
import { decisionInput, producerInput, userInput } from '../support/identity-fixtures.js';
import { publishedProductInput, testProductImage } from '../support/product-fixtures.js';

const configuration = parseEnvironment({
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
  MONGODB_DB_NAME: `docampo_test_${randomUUID().replaceAll('-', '')}`,
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: '2000',
});
let database: Awaited<ReturnType<typeof connectDatabase>> | undefined;
let User: Model<UserRecord>;
let Producer: Model<ProducerRecord>;
let Product: Model<ProductRecord>;
let administratorId: Types.ObjectId;
let sequence = 0;

beforeAll(async () => {
  database = await connectDatabase(configuration);
  const hello = await database.connection.db!.admin().command({ hello: 1 });
  expect(hello.setName).toBe('rs-dcm-test');
  expect(hello.isWritablePrimary).toBe(true);
  User = createUserModel(database.connection);
  Producer = createProducerModel(database.connection);
  Product = createProductModel(database.connection);
  for (const model of [User, Producer, Product]) {
    await model.createCollection();
    await model.createIndexes();
  }
  const admin = await User.create(
    userInput({
      emailNormalizado: 'administracao-ficticia@example.invalid',
      papeis: ['administrador'],
    }),
  );
  administratorId = admin._id;
});

afterAll(async () => {
  if (!database) return;
  try {
    await database.connection.dropDatabase();
  } finally {
    await database.close();
  }
});

async function createOwner(
  estado: ApplicationStatus = 'aprovado',
  papeis: UserRole[] = ['produtor'],
) {
  sequence++;
  const account = await User.create(
    userInput({ emailNormalizado: `produtor-${sequence}@example.invalid`, papeis }),
  );
  const aprovacao =
    estado === 'pendente'
      ? { estado }
      : decisionInput({
          estado,
          decisao: {
            autor: administratorId,
            data: new Date('2026-10-11T09:00:00Z'),
            justificacao: 'Decisão fictícia para teste de publicação.',
          },
        });
  const profile = await Producer.create(producerInput({ userId: account._id, aprovacao }));
  return { account, profile };
}

describe('products com MongoDB real e os modelos existentes', () => {
  it('regista só products/users/producers e os índices de consulta previstos', async () => {
    expect(database!.connection.modelNames().sort()).toEqual([
      'ProducerProfile',
      'Product',
      'User',
    ]);
    const indexes = await Product.listIndexes();
    expect(indexes).toHaveLength(3);
    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { produtor: 1, estadoPublicacao: 1 } }),
    );
    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { estadoPublicacao: 1, categoriaId: 1 } }),
    );
    expect(indexes.filter((index) => index.unique)).toHaveLength(0);
    const collections = await database!.connection.db!.listCollections().toArray();
    expect(collections.map((collection) => collection.name).sort()).toEqual([
      'producers',
      'products',
      'users',
    ]);
  });

  it('persiste rascunho apenas com nome editável, owner e timestamps, sem categoria/stock inventados', async () => {
    const { account } = await createOwner('pendente');
    const created = await Product.create({
      nome: '  Produto em preparação  ',
      produtor: account._id,
    });
    const read = await Product.findById(created._id).orFail();
    expect(read.nome).toBe('Produto em preparação');
    expect(read.estadoPublicacao).toBe('rascunho');
    expect(read.precoCent).toBeUndefined();
    expect(read.categoriaId).toBeUndefined();
    expect(read.stockDisponivel).toBeUndefined();
    expect(read.imagens).toEqual([]);
    expect(read.createdAt).toBeInstanceOf(Date);
    expect(read.updatedAt).toBeInstanceOf(Date);
    expect(read.produtor.toString()).toBe(account._id.toString());
    expect((await read.populate('produtor', 'nome')).get('produtor')).toMatchObject({
      nome: account.nome,
    });
    expect(JSON.stringify(read)).not.toContain('passwordHash');
  });

  it('não publica automaticamente um rascunho ao aprovar o perfil', async () => {
    const { account, profile } = await createOwner('pendente');
    const product = await Product.create({ nome: 'Rascunho estável', produtor: account._id });
    profile.set(
      'aprovacao',
      decisionInput({
        decisao: { autor: administratorId, data: new Date('2026-10-11T09:00:00Z') },
      }),
    );
    await profile.save();
    expect((await Product.findById(product._id).orFail()).estadoPublicacao).toBe('rascunho');
  });

  it('publica por alteração explícita com dados completos e produtor aprovado', async () => {
    const { account } = await createOwner();
    const product = await Product.create({ nome: 'Rascunho', produtor: account._id });
    product.set(publishedProductInput({ produtor: account._id }));
    await product.save();
    const read = await Product.findById(product._id).orFail();
    expect(read.estadoPublicacao).toBe('publicado');
    expect(read.unidadeVenda).toMatchObject({
      modalidade: 'peso',
      unidadeBase: 'g',
      quantidadeReferencia: 1000,
      quantidadeMinima: 250,
      incrementoCompra: 50,
    });
  });

  it.each(['pendente', 'rejeitado'] as const)(
    'recusa publicação por perfil %s sem persistir produto',
    async (status) => {
      const { account } = await createOwner(status);
      const before = await Product.countDocuments();
      await expect(
        Product.create(publishedProductInput({ produtor: account._id })),
      ).rejects.toMatchObject({ name: 'ValidationError' });
      expect(await Product.countDocuments()).toBe(before);
    },
  );

  it('recusa conta inexistente, perfil inexistente, identidade só compradora e ID de perfil usado como owner', async () => {
    const { account: buyer } = await createOwner('aprovado', ['comprador']);
    const { profile } = await createOwner();
    const noProfile = await User.create(
      userInput({ emailNormalizado: 'sem-perfil@example.invalid', papeis: ['produtor'] }),
    );
    for (const produtor of [new Types.ObjectId(), buyer._id, noProfile._id, profile._id]) {
      await expect(Product.create(publishedProductInput({ produtor }))).rejects.toMatchObject({
        name: 'ValidationError',
      });
    }
  });

  it('aceita conta acumulável comprador/produtor sem confundir papéis com aprovação', async () => {
    const { account } = await createOwner('aprovado', ['comprador', 'produtor']);
    const product = await Product.create(publishedProductInput({ produtor: account._id }));
    expect(product.estadoPublicacao).toBe('publicado');
  });

  it('mantém publicado com stock zero e após reposição sem criar estados extra ou reservas', async () => {
    const { account } = await createOwner();
    const product = await Product.create(
      publishedProductInput({ produtor: account._id, stockDisponivel: 0 }),
    );
    expect(product.estadoPublicacao).toBe('publicado');
    product.stockDisponivel = 1500;
    await product.save();
    const read = await Product.findById(product._id).orFail();
    expect(read.estadoPublicacao).toBe('publicado');
    expect(read.stockDisponivel).toBe(1500);
    expect(read.toObject()).not.toHaveProperty('stockReservadoLeilao');
    expect(read.toObject()).not.toHaveProperty('disponivel');
  });

  it('não torna rascunhos/arquivados publicados quando recebem stock', async () => {
    const { account } = await createOwner();
    for (const estadoPublicacao of ['rascunho', 'arquivado'] as const) {
      const product = await Product.create({
        nome: 'Sem publicação automática',
        produtor: account._id,
        estadoPublicacao,
        unidadeVenda: { modalidade: 'unidade', quantidadeMinima: 1, incrementoCompra: 1 },
        stockDisponivel: 0,
      });
      product.stockDisponivel = 20;
      await product.save();
      expect((await Product.findById(product._id).orFail()).estadoPublicacao).toBe(
        estadoPublicacao,
      );
    }
  });

  it('revalida aprovação na gravação de um publicado e não assume elegibilidade por stock positivo', async () => {
    const { account, profile } = await createOwner();
    const product = await Product.create(
      publishedProductInput({ produtor: account._id, stockDisponivel: 0 }),
    );
    // Alteração interna de fixture, não um serviço de revogação/candidatura real.
    profile.set('aprovacao', { estado: 'pendente', submetidaEm: new Date() });
    await profile.save();
    product.stockDisponivel = 1000;
    await expect(product.save()).rejects.toMatchObject({ name: 'ValidationError' });
    expect((await Product.findById(product._id).orFail()).stockDisponivel).toBe(0);
  });

  it('revalida preço, modalidade e limites de stock sem persistir dados inválidos', async () => {
    const { account } = await createOwner();
    for (const values of [
      { precoCent: 0 },
      { precoCent: 1_000_001 },
      { precoCent: 1.5 },
      { stockDisponivel: -1 },
      { stockDisponivel: 10_000_001 },
      {
        stockDisponivel: 100_001,
        unidadeVenda: { modalidade: 'embalagem', quantidadeMinima: 1, incrementoCompra: 1 },
      },
      {
        unidadeVenda: {
          modalidade: 'peso',
          quantidadeReferencia: 100,
          quantidadeMinima: 1,
          incrementoCompra: 1,
        },
      },
    ]) {
      await expect(
        Product.create(publishedProductInput({ produtor: account._id, ...values })),
      ).rejects.toMatchObject({ name: 'ValidationError' });
    }
  });

  it('preserva contagem comercial de embalagens e conteúdo físico separado', async () => {
    const { account } = await createOwner();
    const product = await Product.create(
      publishedProductInput({
        produtor: account._id,
        stockDisponivel: 2,
        unidadeVenda: {
          modalidade: 'embalagem',
          quantidadeMinima: 1,
          incrementoCompra: 1,
          conteudoPorUnidade: { quantidade: 500, unidade: 'g' },
        },
      }),
    );
    const read = await Product.findById(product._id).orFail();
    expect(read.stockDisponivel).toBe(2);
    expect(read.unidadeVenda?.quantidadeReferencia).toBe(1);
    expect(read.unidadeVenda?.conteudoPorUnidade).toMatchObject({ quantidade: 500, unidade: 'g' });
  });

  it('persiste duas fotografias, principal explícita, declaração e ingredientes normalizados', async () => {
    const { account } = await createOwner();
    const product = await Product.create(
      publishedProductInput({
        produtor: account._id,
        ingredientesAplicaveis: true,
        ingredientes: ['  Água  ', 'Fruta'],
        etiquetas: ['  Colheita local  '],
        epocaMeses: [1, 12],
        imagens: [
          testProductImage,
          { url: 'https://example.invalid/segunda.jpg', principal: false },
        ],
      }),
    );
    const read = await Product.findById(product._id).orFail();
    expect(read.ingredientes).toEqual(['Água', 'Fruta']);
    expect(read.etiquetas).toEqual(['Colheita local']);
    expect(read.imagens.filter((image) => image.principal)).toHaveLength(1);
    expect(read.epocaMeses).toEqual([1, 12]);
    expect(read.estadoPublicacao).toBe('publicado');
  });

  it('não persiste publicação sem ingredientes aplicáveis ou com fotografias inválidas', async () => {
    const { account } = await createOwner();
    for (const values of [
      { ingredientesAplicaveis: true, ingredientes: [] },
      { imagens: [] },
      { imagens: [testProductImage, testProductImage] },
      { imagens: [{ ...testProductImage, bytes: Buffer.from('nao-guardar') }] },
    ]) {
      await expect(
        Product.create(publishedProductInput({ produtor: account._id, ...values })),
      ).rejects.toMatchObject({ name: 'ValidationError' });
    }
  });

  it('permite nomes repetidos e alteração do preço persistido sem alterar uma cópia histórica de referência', async () => {
    const { account } = await createOwner();
    const first = await Product.create(publishedProductInput({ produtor: account._id }));
    const second = await Product.create(publishedProductInput({ produtor: account._id }));
    const before = await Product.findById(first._id).lean().orFail();
    first.precoCent = 200;
    await first.save();
    expect((await Product.findById(first._id).orFail()).precoCent).toBe(200);
    expect((await Product.findById(second._id).orFail()).precoCent).toBe(150);
    expect(before.precoCent).toBe(150);
    // Só uma leitura antiga; não é encomenda, snapshot comercial implementado ou confirmação UI.
  });

  it('protege proprietário e recusa updates/bulk que contornem invariantes', async () => {
    const { account } = await createOwner();
    const other = await createOwner();
    const product = await Product.create(publishedProductInput({ produtor: account._id }));
    product.produtor = other.account._id;
    await expect(product.save()).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(Product.updateOne({ _id: product._id }, { stockDisponivel: -1 })).rejects.toThrow(
      'save',
    );
    await expect(Product.insertMany([publishedProductInput()], { lean: true })).rejects.toThrow(
      'bulk',
    );
    expect((await Product.findById(product._id).orFail()).produtor.toString()).toBe(
      account._id.toString(),
    );
  });

  it('permite leitura parcial sem erro e recusa guardar sem contexto completo de publicação', async () => {
    const { account } = await createOwner();
    const product = await Product.create(publishedProductInput({ produtor: account._id }));
    const partial = await Product.findById(product._id).select('nome produtor precoCent').orFail();
    expect(() => partial.toJSON()).not.toThrow();
    partial.precoCent = 175;
    await expect(partial.save()).rejects.toThrow('documento completo');
    expect((await Product.findById(product._id).orFail()).precoCent).toBe(150);
  });

  it('propaga sessão nas verificações de publicação e participa num rollback técnico sem checkout', async () => {
    const { account } = await createOwner();
    const id = new Types.ObjectId();
    try {
      await database!.connection.transaction(async (session) => {
        const product = new Product(
          publishedProductInput({
            _id: id,
            produtor: account._id,
            unidadeVenda: {
              modalidade: 'embalagem',
              quantidadeMinima: 1,
              incrementoCompra: 1,
              conteudoPorUnidade: { quantidade: 500, unidade: 'g' },
            },
          }),
        );
        await product.save({ session });
        throw new Error('Abortar ensaio técnico de produto.');
      });
      expect.fail('A transação devia ter sido abortada.');
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Abortar ensaio técnico de produto.')
        throw error;
    }
    expect(await Product.exists({ _id: id })).toBeNull();
  });
});
