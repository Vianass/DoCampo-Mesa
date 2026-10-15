import { expect, test } from '@playwright/test';
import { products, producers } from '../src/data/market';
import { producerReviews } from '../src/data/reviews';
import {
  producerCategories,
  relatedProducts,
  reviewsForProducer,
  reviewSummary,
} from '../src/features/market/selectors';
import type { Product } from '../src/types/market';

test('relações de produtos e avaliações referenciam produtores existentes sem duplicação', () => {
  const ids = new Set(producers.map((producer) => producer.id));
  expect(ids.size).toBe(7);
  expect(new Set(products.map((product) => product.id)).size).toBe(36);
  for (const product of products) {
    const producer = producers.find((item) => item.id === product.producerId);
    expect(producer).toBeDefined();
    expect(product.producerName).toBe(producer?.name);
    expect(product.producerLocation).toBe(producer?.locality);
    expect(new Set(product.images.map((image) => image.src)).size).toBe(product.images.length);
    expect(product.detailParagraphs?.length).toBeGreaterThanOrEqual(2);
  }
  for (const review of producerReviews) {
    expect(ids.has(review.producerId)).toBe(true);
    expect(review.demonstration).toBe(true);
    expect(review.rating).toBeGreaterThanOrEqual(1);
    expect(review.rating).toBeLessThanOrEqual(5);
  }
});

test('relacionados priorizam categoria, depois produtor, depois épocas sem alterar a fonte', () => {
  const current = products[0];
  if (!current) throw new Error('A amostra deve conter pelo menos um produto.');
  const sameCategory = {
    ...current,
    id: 'categoria',
    producerId: 'outro',
    season: ['Inverno'] as const,
    name: 'A',
  };
  const sameProducer = { ...current, id: 'produtor', category: 'Fruta' as const, name: 'B' };
  const sameBoth = { ...current, id: 'ambos', season: ['Inverno'] as const, name: 'C' };
  const seasonal = { ...current, id: 'epoca', name: 'D' };
  const source: readonly Product[] = [current, sameProducer, sameCategory, sameBoth, seasonal];
  const snapshot = JSON.stringify(source);
  expect(relatedProducts(current, source).map((item) => item.id)).toEqual([
    'epoca',
    'ambos',
    'categoria',
    'produtor',
  ]);
  expect(relatedProducts(current, source)).toEqual(relatedProducts(current, source));
  expect(relatedProducts(current, source, 2)).toHaveLength(2);
  expect(relatedProducts(current, [current])).toEqual([]);
  expect(JSON.stringify(source)).toBe(snapshot);
});

test('categorias derivadas e médias de avaliações refletem exclusivamente o produtor selecionado', () => {
  expect(producerCategories(products, 'horta-ribeira')).toEqual([
    'Ervas e aromáticas',
    'Hortícolas',
  ]);
  const snapshot = JSON.stringify(producerReviews);
  const selection = reviewsForProducer(producerReviews, 'horta-ribeira');
  expect(reviewSummary(selection)).toEqual({ count: 2, average: 4.5 });
  expect(selection.every((review) => review.producerId === 'horta-ribeira')).toBe(true);
  expect(reviewSummary(reviewsForProducer(producerReviews, 'quinta-serra'))).toEqual({
    count: 0,
    average: null,
  });
  expect(JSON.stringify(producerReviews)).toBe(snapshot);
});
