import type { Product } from '../../types/market';
import { createContext } from 'react';
import type { CartSession, CartPurchaseLine } from './types';
import type { cartSummary } from './model';

export interface CartContextValue extends CartSession, ReturnType<typeof cartSummary> {
  /** Aliases in integer EUR cents; explicit *Cents fields remain available. */
  subtotal: number;
  total: number;
  addItem: (productId: string, quantity?: number, product?: Product) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  snapshotPurchase: () => CartPurchaseLine[];
  acknowledgePurchase: (lines: readonly CartPurchaseLine[]) => void;
  remoteIssue?: string;
}
export const CartContext = createContext<CartContextValue | null>(null);
