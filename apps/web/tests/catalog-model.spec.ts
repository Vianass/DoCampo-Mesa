import { expect, test } from '@playwright/test';
import { products } from '../src/data/market';
import {
  defaultFilters,
  deriveCatalogOptions,
  filterProducts,
  paginateProducts,
  readCatalogQuery,
  sortOptions,
  sortProducts,
  writeCatalogQuery,
} from '../src/features/catalog/catalog';

test('ordenações preservam o dataset original e contêm todos os produtos', () => {
  const before = JSON.stringify(products);
  for (const option of sortOptions) {
    const sorted = sortProducts(products, option.value, 'maçã');
    expect(sorted).not.toBe(products);
    expect(new Set(sorted.map((product) => product.id)).size).toBe(products.length);
  }
  expect(JSON.stringify(products)).toBe(before);
});

test('limite de preço inclusivo, zero e biológico combinam sem alterar os dados', () => {
  const exact = filterProducts(products, {
    ...defaultFilters(),
    search: 'Abóbora',
    maxPriceCents: 160,
    organicOnly: true,
  });
  expect(exact.map((product) => product.id)).toEqual(['abobora-menina']);
  expect(
    filterProducts(products, { ...defaultFilters(), maxPriceCents: 159, search: 'Abóbora' }),
  ).toEqual([]);
  expect(filterProducts(products, { ...defaultFilters(), maxPriceCents: 0 })).toEqual([]);
});

test('paginação vazia, última página parcial e página fora de limites', () => {
  expect(paginateProducts([], 99, 12)).toMatchObject({
    items: [],
    totalPages: 0,
    page: 1,
    start: 0,
    end: 0,
  });
  expect(paginateProducts(products.slice(0, 25), 3, 12)).toMatchObject({
    page: 3,
    totalPages: 3,
    total: 25,
    start: 25,
    end: 25,
  });
  expect(paginateProducts(products, 999, 12)).toMatchObject({ page: 3, totalPages: 3 });
  expect(paginateProducts(products, 1, 0)).toMatchObject({ pageSize: 12 });
});

test('query string inválida usa opções seguras sem transformar zero em ausência de filtro', () => {
  const options = deriveCatalogOptions(products);
  const invalid = readCatalogQuery(
    new URLSearchParams(
      'categoria=Inventada&produtor=alheio&ordem=errada&pagina=NaN&porPagina=0&precoMax=abc',
    ),
    options,
  );
  expect(invalid).toMatchObject({
    filters: defaultFilters(),
    sort: 'relevancia',
    page: 1,
    pageSize: 12,
  });
  const zero = readCatalogQuery(new URLSearchParams('precoMax=0'), options);
  expect(zero.filters.maxPriceCents).toBe(0);
  expect(writeCatalogQuery(zero).get('precoMax')).toBe('0.00');
});

test('estado completo faz round trip no URL e preserva parâmetros alheios', () => {
  const options = deriveCatalogOptions(products);
  const state = {
    filters: {
      ...defaultFilters(),
      search: 'Maçã',
      category: 'Fruta' as const,
      producerId: 'pomar-vale',
      location: 'Arcos de Valdevez',
      season: 'Outono' as const,
      organicOnly: true,
      maxPriceCents: 300,
    },
    sort: 'preco-asc' as const,
    page: 2,
    pageSize: 24,
  };
  const query = writeCatalogQuery(state, new URLSearchParams('referencia=partilha'));
  expect(query.get('referencia')).toBe('partilha');
  expect(readCatalogQuery(query, options)).toEqual(state);
});
