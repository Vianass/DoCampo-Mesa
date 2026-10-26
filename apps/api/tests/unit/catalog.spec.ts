import { randomBytes } from 'node:crypto';
import { createConnection, Types } from 'mongoose';
import { afterAll, describe, expect, it } from 'vitest';
import {
  publicCatalogQuery,
  productCreateSchema,
  productReplaceSchema,
  catalogPattern,
} from '../../src/modules/catalog/catalog.validation.js';
import {
  productTag,
  productPublic,
  productOwn,
} from '../../src/modules/catalog/catalog.serialization.js';
import { productCandidate } from '../support/concurrency-fixtures.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import { createProductModel } from '../../src/modules/products/product.model.js';
import { decisionInput, producerInput } from '../support/identity-fixtures.js';
import { producerCommercialInput } from '../support/producer-commercial-fixtures.js';
const connection = createConnection();
afterAll(() => connection.close());
describe('contrato HTTP de catálogo', () => {
  it('reutiliza paginação e ordenação do catálogo React', () => {
    expect(publicCatalogQuery.parse({})).toEqual({ pagina: 1, porPagina: 12, ordem: 'relevancia' });
  });
  it.each([
    { pagina: '0' },
    { pagina: '1001' },
    { porPagina: '100' },
    { porPagina: ['12', '24'] },
    { ordem: '$where' },
    { produtor: 'slug-demo' },
    { categoria: 'Fruta' },
    { mes: '13' },
    { epoca: 'Verão', mes: '6' },
    { pesquisa: { $ne: null } },
    { 'categoria[$ne]': 'x' },
    { precoMax: '10000.01' },
  ])('rejeita filtros/limites inválidos', (input) => {
    expect(publicCatalogQuery.safeParse(input).success).toBe(false);
  });
  it('converte preço de filtro sem usar arredondamento em float', () => {
    expect(publicCatalogQuery.parse({ precoMax: '12,34' }).precoMax).toBe(1234);
  });
  it('pesquisa literal trata acentos e escapa metacaracteres', () => {
    expect(new RegExp(catalogPattern('evora', true), 'iu').test('Évora')).toBe(true);
    expect(new RegExp(catalogPattern('a.*', true), 'iu').test('aaaa')).toBe(false);
    expect(new RegExp(catalogPattern('a.*', true), 'iu').test('a.*')).toBe(true);
  });
  it.each([
    { produtor: 'alheio' },
    { revisaoOperacional: 1 },
    { moeda: 'EUR' },
    { _id: 'escolhido' },
    { estadoPublicacao: 'publicado' },
  ])('POST rejeita campos internos/estado escolhido', (input) => {
    expect(productCreateSchema.safeParse({ nome: 'Rascunho', ...input }).success).toBe(false);
  });
  it('PUT exige estado explícito e não mantém arrays omitidos', () => {
    expect(productReplaceSchema.safeParse({ nome: 'Produto' }).success).toBe(false);
    expect(
      productReplaceSchema.parse({ nome: 'Produto', estadoPublicacao: 'rascunho' }).etiquetas,
    ).toEqual([]);
  });
});
describe('projeções e ETags opacos', () => {
  it('rascunho legado com unidade null é válido no modelo e omite a unidade no DTO', async () => {
    const Product = createProductModel(connection);
    const draft = new Product({
      nome: 'Rascunho legado',
      produtor: new Types.ObjectId(),
      unidadeVenda: null,
    });
    await expect(draft.validate()).resolves.toBeUndefined();
    const before = draft.toObject({ transform: false });
    const dto = JSON.parse(JSON.stringify(productOwn(before, randomBytes(32))));
    expect(dto).not.toHaveProperty('unidadeVenda');
    expect(draft.toObject({ transform: false })).toEqual(before);
  });
  it('ETag muda com produto/revisão e não expõe a revisão', () => {
    const key = randomBytes(32),
      product = productCandidate();
    const tag = productTag(product, key);
    expect(tag).toMatch(/^"[A-Za-z0-9_-]{43}"$/);
    expect(productTag({ ...product, revisaoOperacional: 1 }, key)).not.toBe(tag);
    expect(productTag({ ...product, _id: new Types.ObjectId() }, key)).not.toBe(tag);
  });
  it('DTO não propaga conta, campos privados ou extras internos futuros', () => {
    const product = { ...productCandidate(), segredo: 'SEGREDO_INTERNO' };
    const Producer = createProducerModel(connection);
    const producer = new Producer(
      producerInput({ aprovacao: decisionInput(), comercial: producerCommercialInput() }),
    ).toObject({ transform: false });
    const serialized = JSON.stringify(productPublic(product, producer));
    for (const value of [
      'passwordHash',
      'pagamentoPrivado',
      'revisaoOperacional',
      'SEGREDO_INTERNO',
      producer.userId.toHexString(),
      producer.telefone,
    ])
      expect(serialized).not.toContain(value);
    expect(productOwn(product, randomBytes(32))).not.toHaveProperty('revisaoOperacional');
  });
});
