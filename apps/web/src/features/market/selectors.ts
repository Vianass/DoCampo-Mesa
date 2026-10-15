import type { Product, ProducerReview } from '../../types/market';

export function producerCategories(products: readonly Product[], producerId: string) {
  return [
    ...new Set(
      products
        .filter((product) => product.producerId === producerId)
        .map((product) => product.category),
    ),
  ].sort((a, b) => a.localeCompare(b, 'pt-PT'));
}

export function relatedProducts(
  current: Product,
  products: readonly Product[],
  limit = 4,
): Product[] {
  const seasonalMatches = (product: Product) =>
    product.season.filter((season) => current.season.includes(season)).length;
  return products
    .filter((product) => product.id !== current.id)
    .sort(
      (a, b) =>
        Number(b.category === current.category) - Number(a.category === current.category) ||
        Number(b.producerId === current.producerId) - Number(a.producerId === current.producerId) ||
        seasonalMatches(b) - seasonalMatches(a) ||
        a.name.localeCompare(b.name, 'pt-PT') ||
        a.id.localeCompare(b.id),
    )
    .slice(0, Math.max(0, limit));
}

export function reviewsForProducer(reviews: readonly ProducerReview[], producerId: string) {
  return reviews
    .filter((review) => review.producerId === producerId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
}

export function reviewSummary(reviews: readonly ProducerReview[]) {
  return {
    count: reviews.length,
    average: reviews.length
      ? reviews.reduce((total, review) => total + review.rating, 0) / reviews.length
      : null,
  };
}
