import { createConnection, Error as MongooseError, Types } from 'mongoose';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import { createProductModel } from '../../src/modules/products/product.model.js';
import { productCategories } from '../../src/modules/products/product.constants.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import { publishedProductInput, testProductImage } from '../support/product-fixtures.js';

const connection = createConnection();
const Product = createProductModel(connection);
const User = createUserModel(connection);
const Producer = createProducerModel(connection);
afterAll(() => connection.close());
beforeEach(() => {
  // Apenas unidade: referências aprovadas fictícias. A integração usa MongoDB real.
  vi.spyOn(User, 'exists').mockResolvedValue({ _id: new Types.ObjectId() });
  vi.spyOn(Producer, 'exists').mockResolvedValue({ _id: new Types.ObjectId() });
});

async function validationError(input: Record<string, unknown>) {
  try {
    await new Product(input).validate();
    return undefined;
  } catch (error) {
    if (error instanceof MongooseError.ValidationError) return error;
    throw error;
  }
}

describe('rascunhos e publicação de products', () => {
  it('permite rascunho só com nome editável e owner técnico, sem inventar preço/categoria/stock', async () => {
    const product = new Product({ nome: '  Couves de teste  ', produtor: new Types.ObjectId() });
    await expect(product.validate()).resolves.toBeUndefined();
    expect(product.nome).toBe('Couves de teste');
    expect(product.estadoPublicacao).toBe('rascunho');
    expect(product.moeda).toBe('EUR');
    for (const field of [
      'categoriaId',
      'precoCent',
      'unidadeVenda',
      'stockDisponivel',
      'ingredientesAplicaveis',
    ])
      expect(product.get(field)).toBeUndefined();
    expect(product.imagens).toEqual([]);
    expect(User.exists).not.toHaveBeenCalled();
    expect(Producer.exists).not.toHaveBeenCalled();
    expect(createProductModel(connection)).toBe(Product);
  });

  it.each(['nome', 'produtor'])('exige %s mesmo no rascunho', async (field) => {
    expect(
      (await validationError({ nome: 'Teste', produtor: new Types.ObjectId(), [field]: undefined }))
        ?.errors,
    ).toHaveProperty(field);
  });

  it.each([
    'descricao',
    'categoriaId',
    'precoCent',
    'unidadeVenda',
    'stockDisponivel',
    'ingredientesAplicaveis',
  ])('exige %s para publicar', async (field) => {
    expect(await validationError(publishedProductInput({ [field]: undefined }))).toBeDefined();
  });

  it.each(['modalidade', 'quantidadeMinima', 'incrementoCompra'])(
    'exige unidadeVenda.%s para publicar',
    async (field) => {
      expect(
        await validationError(
          publishedProductInput({
            unidadeVenda: {
              modalidade: 'peso',
              quantidadeMinima: 250,
              incrementoCompra: 50,
              [field]: undefined,
            },
          }),
        ),
      ).toBeDefined();
    },
  );

  it('permite configuração incompleta de unidade/ingredientes no rascunho e rejeita publicação prematura', async () => {
    const partial = {
      nome: 'Teste',
      produtor: new Types.ObjectId(),
      unidadeVenda: { quantidadeMinima: 250 },
      ingredientesAplicaveis: true,
    };
    expect(await validationError(partial)).toBeUndefined();
    expect(await validationError({ ...partial, estadoPublicacao: 'publicado' })).toBeDefined();
  });

  it('exige aprovação atual e capacidade de produtor, sem autorizar pela escolha de um papel no browser', async () => {
    vi.mocked(User.exists).mockResolvedValueOnce(null);
    expect(await validationError(publishedProductInput())).toBeDefined();
    vi.mocked(Producer.exists).mockResolvedValueOnce(null);
    expect(await validationError(publishedProductInput())).toBeDefined();
    expect(await validationError(publishedProductInput())).toBeUndefined();
  });

  it.each(['rascunho', 'publicado', 'arquivado'])(
    'aceita estado %s sem o derivar de stock',
    async (estadoPublicacao) => {
      const product = new Product(publishedProductInput({ estadoPublicacao, stockDisponivel: 0 }));
      await expect(product.validate()).resolves.toBeUndefined();
      product.stockDisponivel = 1000;
      await expect(product.validate()).resolves.toBeUndefined();
      expect(product.estadoPublicacao).toBe(estadoPublicacao);
    },
  );

  it.each(['esgotado', 'oculto', 'suspenso', 'PUBLICADO'])(
    'recusa quarto estado ou código inválido %s',
    async (estadoPublicacao) => {
      expect(await validationError(publishedProductInput({ estadoPublicacao }))).toBeDefined();
    },
  );
});

describe('categorias e preço inteiro por referência fixa', () => {
  it('tem doze IDs distintos estáveis, separados dos rótulos, incluindo Outros produtos locais', async () => {
    expect(productCategories).toHaveLength(12);
    expect(new Set(productCategories.map((category) => category.id)).size).toBe(12);
    expect(productCategories.at(-1)).toEqual({ id: 'cat-012', nome: 'Outros produtos locais' });
    for (const category of productCategories)
      expect(
        await validationError(publishedProductInput({ categoriaId: category.id })),
      ).toBeUndefined();
  });

  it.each(['Fruta', 'cat-999', '', 1])('recusa categoria inválida %j', async (categoriaId) => {
    expect(await validationError(publishedProductInput({ categoriaId }))).toBeDefined();
  });

  it.each([1, 1_000_000])('aceita limite inclusivo de preço %i cêntimos', async (precoCent) => {
    expect(await validationError(publishedProductInput({ precoCent }))).toBeUndefined();
  });

  it.each([0, -1, 1_000_001, 1.5, '150', true, NaN, Infinity, null])(
    'recusa preço inválido %j',
    async (precoCent) => {
      expect(await validationError(publishedProductInput({ precoCent }))).toBeDefined();
      expect(
        await validationError({ produtor: new Types.ObjectId(), nome: 'Rascunho', precoCent }),
      ).toBeDefined();
    },
  );

  it.each([
    ['peso', 'g', 1000],
    ['volume', 'ml', 1000],
    ['unidade', 'un', 1],
    ['embalagem', 'un', 1],
  ] as const)(
    'interpreta preço de %s com base %s e referência %i',
    async (modalidade, unidadeBase, quantidadeReferencia) => {
      const product = new Product(
        publishedProductInput({
          unidadeVenda: { modalidade, quantidadeMinima: 1, incrementoCompra: 1 },
        }),
      );
      await expect(product.validate()).resolves.toBeUndefined();
      expect(product.unidadeVenda).toMatchObject({ modalidade, unidadeBase, quantidadeReferencia });
    },
  );

  it.each([
    { modalidade: 'kg' },
    { modalidade: 'peso', unidadeBase: 'ml' },
    { modalidade: 'peso', quantidadeReferencia: 100 },
    { modalidade: 'embalagem', quantidadeReferencia: 500 },
    { modalidade: 'peso', quantidadeReferencia: 1000.5 },
    { modalidade: 'peso', conteudoPorUnidade: { quantidade: 500, unidade: 'g' } },
  ])('recusa representação de unidade incoerente (%j)', async (unit) => {
    expect(
      await validationError(
        publishedProductInput({
          unidadeVenda: { quantidadeMinima: 1, incrementoCompra: 1, ...unit },
        }),
      ),
    ).toBeDefined();
  });

  it('distingue duas embalagens do conteúdo de 500 g em cada embalagem', async () => {
    const product = new Product(
      publishedProductInput({
        stockDisponivel: 2,
        unidadeVenda: {
          modalidade: 'embalagem',
          quantidadeMinima: 1,
          incrementoCompra: 1,
          conteudoPorUnidade: { quantidade: 500, unidade: 'g' },
        },
      }),
    );
    await expect(product.validate()).resolves.toBeUndefined();
    expect(product.stockDisponivel).toBe(2);
    expect(product.unidadeVenda?.quantidadeReferencia).toBe(1);
    expect(product.unidadeVenda?.conteudoPorUnidade?.quantidade).toBe(500);
  });
});

describe('stock e quantidades mínimas', () => {
  it.each([
    ['peso', 10_000_000],
    ['volume', 10_000_000],
    ['unidade', 100_000],
    ['embalagem', 100_000],
  ] as const)('valida fronteiras do stock de %s', async (modalidade, maximum) => {
    const data = publishedProductInput({
      unidadeVenda: { modalidade, quantidadeMinima: 1, incrementoCompra: 1 },
    });
    expect(await validationError({ ...data, stockDisponivel: 0 })).toBeUndefined();
    expect(await validationError({ ...data, stockDisponivel: maximum })).toBeUndefined();
    expect(await validationError({ ...data, stockDisponivel: maximum + 1 })).toBeDefined();
  });

  it.each([-1, 0.5, '2', true, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'recusa stock inválido %j',
    async (stockDisponivel) => {
      expect(await validationError(publishedProductInput({ stockDisponivel }))).toBeDefined();
    },
  );

  it.each(['quantidadeMinima', 'incrementoCompra'])(
    'exige inteiro positivo em %s sem decidir a grelha do checkout',
    async (field) => {
      for (const value of [0, -1, 0.5, '1', true, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        expect(
          await validationError(
            publishedProductInput({
              unidadeVenda: {
                modalidade: 'peso',
                quantidadeMinima: 250,
                incrementoCompra: 100,
                [field]: value,
              },
            }),
          ),
        ).toBeDefined();
      }
      expect(
        await validationError(
          publishedProductInput({
            stockDisponivel: 0,
            unidadeVenda: { modalidade: 'peso', quantidadeMinima: 250, incrementoCompra: 100 },
          }),
        ),
      ).toBeUndefined();
    },
  );
});

describe('ingredientes, fotografias e campos opcionais', () => {
  it('exige declaração de aplicabilidade e ingredientes quando aplicáveis', async () => {
    expect(
      await validationError(publishedProductInput({ ingredientesAplicaveis: true })),
    ).toBeDefined();
    expect(
      await validationError(
        publishedProductInput({
          ingredientesAplicaveis: true,
          ingredientes: ['  Fruta  ', 'Água'],
        }),
      ),
    ).toBeUndefined();
    expect(
      await validationError(
        publishedProductInput({ ingredientesAplicaveis: false, ingredientes: ['Água'] }),
      ),
    ).toBeDefined();
    expect(
      await validationError(publishedProductInput({ ingredientesAplicaveis: 'false' })),
    ).toBeDefined();
  });

  it('aceita zero fotografias no rascunho e uma ou duas na publicação', async () => {
    expect(
      await validationError({ produtor: new Types.ObjectId(), nome: 'Rascunho', imagens: [] }),
    ).toBeUndefined();
    expect(await validationError(publishedProductInput({ imagens: [] }))).toBeDefined();
    expect(
      await validationError(publishedProductInput({ imagens: [testProductImage] })),
    ).toBeUndefined();
    expect(
      await validationError(
        publishedProductInput({
          imagens: [
            testProductImage,
            { ...testProductImage, principal: false, url: 'https://example.invalid/outra.jpg' },
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it.each(
    [
      [testProductImage, testProductImage],
      [
        testProductImage,
        { ...testProductImage, principal: false },
        { ...testProductImage, principal: false },
      ],
      [{ url: 'javascript:alert(1)' }],
      [{ url: 'https://conta:segredo@example.invalid/imagem.jpg' }],
      [{ alt: 'Sem referência' }],
      [{ ...testProductImage, principal: 'true' }],
      [null],
    ].map((imagens) => ({ imagens })),
  )('recusa fotografias inválidas (%j)', async ({ imagens }) => {
    expect(await validationError(publishedProductInput({ imagens }))).toBeDefined();
  });

  it('não exige etiquetas, meses ou modo de produção para publicar; meses são informativos', async () => {
    const product = new Product(
      publishedProductInput({
        ingredientesAplicaveis: true,
        ingredientes: ['  Água  '],
        etiquetas: ['  Colheita local  '],
        epocaMeses: [1, 12],
        stockDisponivel: 1000,
      }),
    );
    await expect(product.validate()).resolves.toBeUndefined();
    expect(product.ingredientes).toEqual(['Água']);
    expect(product.etiquetas).toEqual(['Colheita local']);
    expect(product.estadoPublicacao).toBe('publicado');
    expect(await validationError(publishedProductInput())).toBeUndefined();
  });

  it.each([
    { ingredientes: 'Água' },
    { ingredientes: null },
    { ingredientes: [42] },
    { ingredientes: ['  '] },
    { etiquetas: 'local' },
    { etiquetas: null },
    { etiquetas: [''] },
    { epocaMeses: [0] },
    { epocaMeses: [13] },
    { epocaMeses: [1, 1] },
    { epocaMeses: [1.5] },
    { epocaMeses: ['1'] },
    { epocaMeses: null },
  ])('recusa listas/tipos inválidos (%j)', async (input) => {
    expect(await validationError(publishedProductInput(input))).toBeDefined();
  });

  it('não aceita credenciais, ficheiros binários ou estados de disponibilidade forjados', async () => {
    for (const input of [{ passwordHash: 'nao-aceitar' }, { disponivel: true }]) {
      expect(() => new Product(publishedProductInput(input))).toThrow();
    }
    expect(
      await validationError(
        publishedProductInput({
          imagens: [{ ...testProductImage, bytes: Buffer.from('nao-guardar') }],
        }),
      ),
    ).toBeDefined();
  });
});
