export type ProductCategory =
  | 'Hortícolas'
  | 'Fruta'
  | 'Mel e compotas'
  | 'Queijos e laticínios'
  | 'Azeite e azeitonas'
  | 'Pão e cereais'
  | 'Frutos secos'
  | 'Ervas e aromáticas';
export type Category = 'Todos' | ProductCategory;
export type Season = 'Primavera' | 'Verão' | 'Outono' | 'Inverno';

export interface ProductImage {
  src: string;
  alt: string;
}
export interface Product {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: ProductCategory;
  readonly priceCents: number;
  readonly unit: string;
  readonly availableStock: number;
  readonly images: readonly [ProductImage, ...ProductImage[]];
  readonly producerId: string;
  readonly producerName: string;
  readonly producerLocation: string;
  readonly organic: boolean;
  readonly season: readonly Season[];
  readonly featured: boolean;
  readonly createdAt: string;
}
export interface Producer {
  id: string;
  name: string;
  locality: string;
  specialty: string;
  description: string;
  image: string;
  imageAlt: string;
}
export interface Auction {
  id: string;
  title: string;
  producer: string;
  locality: string;
  image: string;
  imageAlt: string;
  quantity: string;
  currentPriceCents: number;
  remainingLabel: string;
}
