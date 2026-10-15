import type { Product, ProductCategory, Season } from '../../types/market';

export interface CatalogFilters {
  search: string;
  category: ProductCategory | '';
  producerId: string;
  location: string;
  season: Season | '';
  organicOnly: boolean;
  maxPriceCents: number | null;
}
export const sortOptions = [
  { value: 'relevancia', label: 'Relevância' },
  { value: 'preco-asc', label: 'Preço: mais baixo primeiro' },
  { value: 'preco-desc', label: 'Preço: mais alto primeiro' },
  { value: 'nome-asc', label: 'Nome: A–Z' },
  { value: 'nome-desc', label: 'Nome: Z–A' },
  { value: 'recentes', label: 'Mais recentes' },
] as const;
export type CatalogSort = (typeof sortOptions)[number]['value'];
export const pageSizes = [12, 24, 36] as const;
export interface CatalogState {
  filters: CatalogFilters;
  sort: CatalogSort;
  page: number;
  pageSize: number;
}
export interface CatalogOptions {
  categories: ProductCategory[];
  producers: { id: string; name: string }[];
  locations: string[];
  seasons: Season[];
  priceCeilingCents: number;
}
const collator = new Intl.Collator('pt-PT', { sensitivity: 'base', numeric: true });
const queryKeys = [
  'pesquisa',
  'categoria',
  'produtor',
  'localidade',
  'epoca',
  'bio',
  'precoMax',
  'ordem',
  'pagina',
  'porPagina',
];

export function defaultFilters(): CatalogFilters {
  return {
    search: '',
    category: '',
    producerId: '',
    location: '',
    season: '',
    organicOnly: false,
    maxPriceCents: null,
  };
}
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-PT')
    .trim();
}
export function deriveCatalogOptions(items: readonly Product[]): CatalogOptions {
  const producerMap = new Map(items.map((item) => [item.producerId, item.producerName]));
  const seasonOrder: Season[] = ['Primavera', 'Verão', 'Outono', 'Inverno'];
  return {
    categories: [...new Set(items.map((item) => item.category))].sort(collator.compare),
    producers: [...producerMap]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => collator.compare(a.name, b.name)),
    locations: [...new Set(items.map((item) => item.producerLocation))].sort(collator.compare),
    seasons: seasonOrder.filter((season) => items.some((item) => item.season.includes(season))),
    priceCeilingCents: Math.max(
      100,
      Math.ceil(Math.max(0, ...items.map((item) => item.priceCents)) / 100) * 100,
    ),
  };
}

export function readCatalogQuery(params: URLSearchParams, options: CatalogOptions): CatalogState {
  const max = params.get('precoMax') ?? '';
  const parsedMax = /^\d+(?:[.,]\d{1,2})?$/.test(max)
    ? Math.round(Number(max.replace(',', '.')) * 100)
    : null;
  const rawPage = params.get('pagina') ?? '1';
  const parsedPage = /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  const category = options.categories.find((item) => item === params.get('categoria')) ?? '';
  const producerId = options.producers.find((item) => item.id === params.get('produtor'))?.id ?? '';
  return {
    filters: {
      search: (params.get('pesquisa') ?? '').slice(0, 100),
      category,
      producerId,
      location: options.locations.find((item) => item === params.get('localidade')) ?? '',
      season: options.seasons.find((item) => item === params.get('epoca')) ?? '',
      organicOnly: params.get('bio') === 'true',
      maxPriceCents:
        parsedMax !== null && Number.isFinite(parsedMax) && parsedMax < options.priceCeilingCents
          ? Math.max(0, parsedMax)
          : null,
    },
    sort: sortOptions.find((item) => item.value === params.get('ordem'))?.value ?? 'relevancia',
    page: Number.isSafeInteger(parsedPage) ? Math.max(1, parsedPage) : 1,
    pageSize: pageSizes.find((item) => item === Number(params.get('porPagina'))) ?? pageSizes[0],
  };
}

export function writeCatalogQuery(
  state: CatalogState,
  previous = new URLSearchParams(),
): URLSearchParams {
  const params = new URLSearchParams(previous);
  queryKeys.forEach((key) => params.delete(key));
  const f = state.filters;
  if (f.search) params.set('pesquisa', f.search);
  if (f.category) params.set('categoria', f.category);
  if (f.producerId) params.set('produtor', f.producerId);
  if (f.location) params.set('localidade', f.location);
  if (f.season) params.set('epoca', f.season);
  if (f.organicOnly) params.set('bio', 'true');
  if (f.maxPriceCents !== null) params.set('precoMax', (f.maxPriceCents / 100).toFixed(2));
  if (state.sort !== 'relevancia') params.set('ordem', state.sort);
  if (state.page > 1) params.set('pagina', String(state.page));
  if (state.pageSize !== pageSizes[0]) params.set('porPagina', String(state.pageSize));
  return params;
}

export function filterProducts(items: readonly Product[], filters: CatalogFilters): Product[] {
  const terms = normalizeSearch(filters.search).split(/\s+/).filter(Boolean);
  return items.filter((product) => {
    const text = normalizeSearch(
      `${product.name} ${product.description} ${product.producerName} ${product.producerLocation}`,
    );
    return (
      terms.every((term) => text.includes(term)) &&
      (!filters.category || product.category === filters.category) &&
      (!filters.producerId || product.producerId === filters.producerId) &&
      (!filters.location || product.producerLocation === filters.location) &&
      (!filters.season || product.season.includes(filters.season)) &&
      (!filters.organicOnly || product.organic) &&
      (filters.maxPriceCents === null || product.priceCents <= filters.maxPriceCents)
    );
  });
}

export function sortProducts(items: readonly Product[], sort: CatalogSort, search = ''): Product[] {
  const query = normalizeSearch(search);
  const score = (product: Product) => {
    const name = normalizeSearch(product.name);
    return (
      (product.featured ? 5 : 0) +
      (query && name === query
        ? 100
        : query && name.startsWith(query)
          ? 50
          : query && name.includes(query)
            ? 25
            : 0)
    );
  };
  return [...items].sort((a, b) => {
    switch (sort) {
      case 'preco-asc':
        return a.priceCents - b.priceCents || collator.compare(a.name, b.name);
      case 'preco-desc':
        return b.priceCents - a.priceCents || collator.compare(a.name, b.name);
      case 'nome-asc':
        return collator.compare(a.name, b.name);
      case 'nome-desc':
        return collator.compare(b.name, a.name);
      case 'recentes':
        return (
          Date.parse(b.createdAt) - Date.parse(a.createdAt) || collator.compare(a.name, b.name)
        );
      default:
        return score(b) - score(a);
    }
  });
}

export function paginateProducts(
  items: readonly Product[],
  requestedPage: number,
  requestedPageSize: number,
) {
  const pageSize =
    Number.isSafeInteger(requestedPageSize) && requestedPageSize > 0
      ? requestedPageSize
      : pageSizes[0];
  const totalPages = Math.ceil(items.length / pageSize);
  const validPage = Number.isSafeInteger(requestedPage) ? requestedPage : 1;
  const page = Math.max(1, Math.min(validPage, totalPages || 1));
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    totalPages,
    total: items.length,
    start: items.length ? start + 1 : 0,
    end: Math.min(start + pageSize, items.length),
  };
}

export function activeCatalogFilters(
  filters: CatalogFilters,
  options: CatalogOptions,
): { key: keyof CatalogFilters; label: string }[] {
  const active: { key: keyof CatalogFilters; label: string }[] = [];
  if (filters.search.trim())
    active.push({ key: 'search', label: `Pesquisa: ${filters.search.trim()}` });
  if (filters.category) active.push({ key: 'category', label: filters.category });
  if (filters.producerId)
    active.push({
      key: 'producerId',
      label: options.producers.find((item) => item.id === filters.producerId)?.name ?? '',
    });
  if (filters.location) active.push({ key: 'location', label: filters.location });
  if (filters.season) active.push({ key: 'season', label: filters.season });
  if (filters.organicOnly) active.push({ key: 'organicOnly', label: 'Biológico' });
  if (filters.maxPriceCents !== null)
    active.push({
      key: 'maxPriceCents',
      label: `Até ${(filters.maxPriceCents / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}`,
    });
  return active;
}
