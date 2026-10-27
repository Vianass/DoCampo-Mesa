import type { Product, Season } from '../../types/market';
import { getJson } from './client';
import {
  parsePage,
  parseProduct,
  parseProducer,
  parseProducerDetail,
  type ProductDto,
  type ProducerDto,
} from './catalog-contract';
export const catalogApi = {
  products: (query: string, signal?: AbortSignal) =>
    getJson('/products' + (query ? '?' + query : ''), (v) => parsePage(v, parseProduct), signal),
  product: (id: string, signal?: AbortSignal) =>
    getJson('/products/' + encodeURIComponent(id), parseProduct, signal),
  producers: (query: string, signal?: AbortSignal) =>
    getJson('/producers' + (query ? '?' + query : ''), (v) => parsePage(v, parseProducer), signal),
  producer: (id: string, query = '', signal?: AbortSignal) =>
    getJson(
      '/producers/' + encodeURIComponent(id) + (query ? '?' + query : ''),
      parseProducerDetail,
      signal,
    ),
};
export function adaptProduct(dto: ProductDto): Product {
  const seasons: Record<Season, readonly number[]> = {
    Primavera: [3, 4, 5],
    Verão: [6, 7, 8],
    Outono: [9, 10, 11],
    Inverno: [12, 1, 2],
  };
  const images = [...dto.imagens]
    .sort((a, b) => Number(b.principal) - Number(a.principal))
    .map((i) => ({ src: i.url, alt: i.alt ?? dto.nome }));
  const unit =
    dto.unidadeVenda.modalidade === 'peso'
      ? 'kg'
      : dto.unidadeVenda.modalidade === 'volume'
        ? 'L'
        : dto.unidadeVenda.modalidade === 'embalagem'
          ? 'embalagem'
          : 'unidade';
  return {
    id: dto.id,
    name: dto.nome,
    description: dto.descricao,
    category: dto.categoria.nome as Product['category'],
    categoryId: dto.categoria.id,
    priceCents: dto.precoCent,
    unit,
    availableStock: dto.stockDisponivel,
    images: images as [(typeof images)[number], ...typeof images],
    producerId: dto.produtor.id,
    producerName: dto.produtor.nomePublico,
    producerLocation: dto.produtor.localidade,
    organic:
      dto.modoProducao
        ?.normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase() === 'biologico',
    season: (Object.keys(seasons) as Season[]).filter((s) =>
      dto.epocaMeses?.some((m) => seasons[s].includes(m)),
    ),
    featured: false,
    createdAt: dto.createdAt,
    source: 'api',
    sale: dto.unidadeVenda,
    seasonMonths: dto.epocaMeses,
    productionMode: dto.modoProducao,
  };
}
export function adaptProducer(dto: ProducerDto) {
  return {
    id: dto.id,
    name: dto.nomePublico,
    description: dto.descricao,
    locality: dto.localidade,
    image: dto.imagem?.url ?? '/images/product-placeholder.svg',
    imageAlt: dto.imagem?.alt ?? 'Imagem do produtor não disponibilizada',
  };
}
export function stockLabel(product: Product) {
  return product.source === 'api'
    ? `${product.availableStock.toLocaleString('pt-PT')} ${product.sale?.unidadeBase === 'un' ? (product.sale.modalidade === 'embalagem' ? 'embalagens' : 'unidades') : product.sale?.unidadeBase}`
    : String(product.availableStock);
}
export function seasonLabel(product: Product) {
  return product.source === 'api'
    ? product.seasonMonths?.length
      ? product.seasonMonths
          .map((m) =>
            new Intl.DateTimeFormat('pt-PT', { month: 'long', timeZone: 'UTC' }).format(
              new Date(Date.UTC(2026, m - 1, 1)),
            ),
          )
          .join(', ')
      : 'Não indicada pelo produtor'
    : product.season.length === 4
      ? 'Todo o ano'
      : product.season.join(' · ');
}

// Registos demonstrativos não têm identidade no MongoDB; não adivinhar correspondências.
export function publicProductPath(id: string) {
  return /^([a-fA-F0-9]{24})$/.test(id) ? '/produtos/' + id : '/produtos';
}
export function publicProducerPath(id: string) {
  return /^([a-fA-F0-9]{24})$/.test(id) ? '/produtores/' + id : '/produtores';
}
