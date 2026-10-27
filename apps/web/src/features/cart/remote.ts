import type { Product } from '../../types/market';
import { categories, objectId, parseSale } from '../api/catalog-contract';
/** Apenas metadados públicos mínimos; estes snapshots nunca autorizam compras. */
export function storedProduct(value: unknown): Product | undefined {
  try {
    if (typeof value !== 'object' || value === null) return;
    const v = value as Record<string, unknown>;
    if (
      v.source !== 'api' ||
      typeof v.id !== 'string' ||
      !objectId(v.id) ||
      typeof v.producerId !== 'string' ||
      !objectId(v.producerId)
    )
      return;
    for (const key of [
      'name',
      'description',
      'producerName',
      'producerLocation',
      'unit',
      'createdAt',
    ])
      if (typeof v[key] !== 'string' || !(v[key] as string).trim()) return;
    if (
      !Number.isFinite(Date.parse(v.createdAt as string)) ||
      !Number.isSafeInteger(v.priceCents) ||
      Number(v.priceCents) < 1 ||
      Number(v.priceCents) > 1000000 ||
      !Number.isSafeInteger(v.availableStock) ||
      Number(v.availableStock) < 0
    )
      return;
    const category = categories.find((c) => c.id === v.categoryId && c.name === v.category);
    if (!category) return;
    const sale = parseSale(v.sale);
    if (!Array.isArray(v.images) || !v.images.length || v.images.length > 2) return;
    const images = v.images.map((image) => {
      if (typeof image?.src !== 'string' || typeof image?.alt !== 'string') throw Error();
      const url = new URL(image.src);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw Error();
      return { src: image.src as string, alt: image.alt as string };
    });
    return {
      id: v.id,
      name: v.name as string,
      description: v.description as string,
      producerId: v.producerId,
      producerName: v.producerName as string,
      producerLocation: v.producerLocation as string,
      category: category.name,
      categoryId: category.id,
      priceCents: Number(v.priceCents),
      availableStock: Number(v.availableStock),
      unit:
        sale.modalidade === 'peso'
          ? 'kg'
          : sale.modalidade === 'volume'
            ? 'L'
            : sale.modalidade === 'embalagem'
              ? 'embalagem'
              : 'unidade',
      createdAt: v.createdAt as string,
      images: images as [(typeof images)[number], ...typeof images],
      source: 'api',
      sale,
      featured: false,
      organic: false,
      season: [],
    };
  } catch {
    return;
  }
}
export function mergeCatalog(base: readonly Product[], updates: readonly Product[]) {
  return [...new Map([...base, ...updates].map((p) => [p.id, p])).values()];
}
