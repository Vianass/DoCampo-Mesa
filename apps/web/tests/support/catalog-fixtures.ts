import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import { products, producers } from '../../src/data/market';
import {
  categories,
  type ProductDto,
  type ProducerDto,
} from '../../src/features/api/catalog-contract';
import { normalizeSearch, sortProducts } from '../../src/features/catalog/catalog';
import { adaptProduct } from '../../src/features/api/catalog';
export function fixtureId(kind: string, slug: string) {
  return createHash('sha256')
    .update('docampo-local-catalog-v1:' + kind + ':' + slug)
    .digest('hex')
    .slice(0, 24);
}
const categoryIds: Record<string, string> = {
  Hortícolas: 'cat-001',
  Fruta: 'cat-002',
  'Mel e compotas': 'cat-007',
  'Queijos e laticínios': 'cat-005',
  'Azeite e azeitonas': 'cat-008',
  'Pão e cereais': 'cat-004',
  'Frutos secos': 'cat-009',
  'Ervas e aromáticas': 'cat-010',
};
export const producerDtos: ProducerDto[] = producers.map((p) => ({
  id: fixtureId('producer', p.id),
  nomePublico: p.name,
  descricao: p.description,
  localidade: p.locality,
  concelho: p.locality,
  imagem: { url: 'http://127.0.0.1:5173' + p.image, alt: p.imageAlt },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}));
const months: Record<string, number[]> = {
  Primavera: [3, 4, 5],
  Verão: [6, 7, 8],
  Outono: [9, 10, 11],
  Inverno: [12, 1, 2],
};
// Fixtures HTTP públicas válidas, sem histórias/certificações/reviews. Venda à unidade
// preserva as operações de contagem dos testes antigos; g/ml são cobertos em testes próprios e reais.
export const productDtos: ProductDto[] = products.map((p) => {
  const producer = producerDtos.find((x) => x.id === fixtureId('producer', p.producerId))!;
  const category = categories.find((c) => c.id === categoryIds[p.category])!;
  return {
    id: fixtureId('product', p.id),
    nome: p.name,
    descricao: p.description,
    precoCent: p.priceCents,
    moeda: 'EUR',
    unidadeVenda: {
      modalidade: 'unidade',
      unidadeBase: 'un',
      quantidadeReferencia: 1,
      quantidadeMinima: 1,
      incrementoCompra: 1,
    },
    categoria: { id: category.id, nome: category.name },
    stockDisponivel: p.availableStock,
    disponivel: p.availableStock > 0,
    ingredientesAplicaveis: false,
    ingredientes: [],
    etiquetas: [],
    epocaMeses: [...new Set(p.season.flatMap((s) => months[s] ?? []))],
    modoProducao: p.organic ? 'Biológico' : 'Convencional',
    imagens: p.images.slice(0, 2).map((i, index) => ({
      url: 'http://127.0.0.1:5173' + i.src,
      alt: i.alt,
      principal: index === 0,
    })),
    produtor: {
      id: producer.id,
      nomePublico: producer.nomePublico,
      localidade: producer.localidade,
      concelho: producer.concelho,
      imagem: producer.imagem,
    },
    createdAt: p.createdAt,
    updatedAt: p.createdAt,
  };
});
export const productFixture = (slug: string) =>
  productDtos.find((p) => p.id === fixtureId('product', slug))!;
export function envelope<T>(items: T[], params: URLSearchParams) {
  const pagina = Number(params.get('pagina') ?? 1),
    porPagina = Number(params.get('porPagina') ?? 12);
  return {
    itens: items.slice((pagina - 1) * porPagina, pagina * porPagina),
    pagina,
    porPagina,
    total: items.length,
    totalPaginas: Math.ceil(items.length / porPagina),
  };
}
export function mockCatalogResponse(url: URL) {
  const p = url.searchParams,
    path = url.pathname.replace(/^\/api/, '');
  function selection(owner?: string) {
    const terms = normalizeSearch(p.get('pesquisa') ?? '')
      .split(/\s+/)
      .filter(Boolean);
    const list = productDtos.filter(
      (item) =>
        terms.every((t) =>
          normalizeSearch(
            [item.nome, item.descricao, item.produtor.nomePublico, item.produtor.localidade].join(
              ' ',
            ),
          ).includes(t),
        ) &&
        (!owner || item.produtor.id === owner) &&
        (!p.get('categoria') || item.categoria.id === p.get('categoria')) &&
        (!p.get('produtor') || item.produtor.id === p.get('produtor')) &&
        (!p.get('localidade') ||
          normalizeSearch(item.produtor.localidade) === normalizeSearch(p.get('localidade')!)) &&
        (!p.get('epoca') || item.epocaMeses?.some((m) => months[p.get('epoca')!]?.includes(m))) &&
        (!p.get('modoProducao') ||
          normalizeSearch(item.modoProducao ?? '') === normalizeSearch(p.get('modoProducao')!)) &&
        (p.get('bio') !== 'true' || item.modoProducao === 'Biológico') &&
        (!p.has('precoMax') ||
          item.precoCent <= Math.round(Number(p.get('precoMax')!.replace(',', '.')) * 100)),
    );
    const order = p.get('ordem') ?? 'relevancia';
    const adapted = sortProducts(
      list.map(adaptProduct),
      order as Parameters<typeof sortProducts>[1],
      p.get('pesquisa') ?? '',
    );
    if (order === 'relevancia' && !p.get('pesquisa'))
      adapted.sort((a, b) => a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }));
    return adapted.map((item) => list.find((v) => v.id === item.id)!);
  }
  if (/^\/(products|producers)\/[a-f0-9]{24}\/reviews$/.test(path)) {
    const [, kind, id] = path.split('/');
    if (!(kind === 'products' ? productDtos : producerDtos).some((item) => item.id === id))
      return undefined;
    return {
      ...envelope([], p),
      resumo: {
        numeroAvaliacoes: 0,
        media: null,
        distribuicao: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
      },
    };
  }
  if (path === '/products') return envelope(selection(), p);
  if (path.startsWith('/products/'))
    return productDtos.find((item) => item.id === path.split('/').at(-1));
  if (path === '/producers')
    return envelope(
      producerDtos.filter(
        (item) =>
          normalizeSearch(item.nomePublico + ' ' + item.descricao + ' ' + item.localidade).includes(
            normalizeSearch(p.get('pesquisa') ?? ''),
          ) &&
          (!p.get('localidade') ||
            normalizeSearch(item.localidade) === normalizeSearch(p.get('localidade')!)),
      ),
      p,
    );
  if (path.startsWith('/producers/')) {
    const producer = producerDtos.find((item) => item.id === path.split('/').at(-1));
    return producer ? { ...producer, produtos: envelope(selection(producer.id), p) } : undefined;
  }
}
export async function mockCatalog(page: Page) {
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const value = mockCatalogResponse(new URL(route.request().url()));
      await route.fulfill({
        status: value ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(
          value ?? { erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Recurso não encontrado.' } },
        ),
      });
    },
  );
}
