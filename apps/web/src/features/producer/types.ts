import type { Product, Producer, ProductCategory } from '../../types/market';
import type { BuyerOrder, BuyerAuctionSnapshot } from '../buyer/types';

export interface ProducerProduct extends Product {
  readonly lowStockThreshold: number;
}
export interface ProducerOrder extends BuyerOrder {
  readonly producerId: string;
  readonly customerLabel: string;
}
export interface ProducerAuction extends Omit<BuyerAuctionSnapshot, 'currentBid' | 'result'> {
  readonly currentBid: BuyerAuctionSnapshot['currentBid'] | null;
  readonly bidCount: number;
  readonly result: BuyerAuctionSnapshot['result'] | { readonly kind: 'sem_licitacoes' };
}
export interface ProducerDataset {
  readonly producerId: string;
  readonly observedAt: string;
  readonly profile: Producer;
  readonly products: readonly ProducerProduct[];
  readonly orders: readonly ProducerOrder[];
  readonly auctions: readonly ProducerAuction[];
  readonly application: { readonly status: 'pendente'; readonly submittedAt: string };
  readonly nextProductId: number;
}
export type ProducerScenario = 'normal' | 'vazio' | 'erro';
export type ProducerResource =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: ProducerDataset };
export interface ProductDraft {
  name: string;
  description: string;
  category: string;
  unit: string;
  price: string;
  stock: string;
  threshold: string;
}
export interface ProfileDraft {
  name: string;
  locality: string;
  description: string;
}
export type FieldErrors<T> = Partial<Record<keyof T, string>>;
export type ProducerCommand =
  | { type: 'product'; draft: ProductDraft; id?: string; now: string }
  | { type: 'profile'; draft: ProfileDraft };
export interface ProducerFeedback {
  kind: 'success' | 'error';
  message: string;
  targetId?: string;
}
export interface ProductOptions {
  search: string;
  category: ProductCategory | '';
  stock: 'todos' | 'disponivel' | 'reduzido' | 'indisponivel';
}
