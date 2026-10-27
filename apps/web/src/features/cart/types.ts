import type { Product } from '../../types/market';

export interface CartItem {
  readonly productId: string;
  readonly producerId: string;
  readonly quantity: number;
  readonly unitPriceSnapshotCents: number;
  readonly unit: string;
  readonly productSnapshot?: Product;
}
export interface CartState {
  readonly items: readonly CartItem[];
  readonly updatedAt: string;
}
export interface CartLine {
  item: CartItem;
  product: Product;
  subtotalCents: number;
}
export interface CartProducerGroup {
  producerId: string;
  producerName: string;
  producerLocation: string;
  lines: CartLine[];
  subtotalCents: number;
  quantity: number;
}
export interface CartFeedback {
  id: number;
  kind: 'success' | 'error';
  message: string;
  productId?: string;
}
export interface CartSession {
  cart: CartState;
  recoveryMessages: readonly string[];
  storageIssue: string | null;
  feedback: CartFeedback | null;
}
export type CartOperation =
  | { type: 'add'; productId: string; quantity: number }
  | { type: 'quantity'; productId: string; quantity: number }
  | { type: 'remove'; productId: string }
  | { type: 'clear' };
export type CartAction =
  | { type: 'operate'; operation: CartOperation; catalog: readonly Product[]; now: string }
  | { type: 'reconcile'; catalog: readonly Product[]; now: string }
  | { type: 'storage-failure' }
  | { type: 'refresh'; catalog: readonly Product[]; now: string };
