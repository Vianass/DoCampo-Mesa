import type { Product } from '../../types/market';
import type { CartSession, CartState } from './types';
import { emptyCart, reconcileItems } from './model';

export const CART_STORAGE_KEY = 'docampo.cart.v1';
export const CART_STORAGE_VERSION = 1;
export function restoreCart(
  raw: string | null,
  catalog: readonly Product[],
  now: string,
): CartSession {
  const blank: CartSession = {
    cart: emptyCart(now),
    feedback: null,
    recoveryMessages: [],
    storageIssue: null,
  };
  if (raw === null) return blank;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value !== 'object' ||
      value === null ||
      !('version' in value) ||
      value.version !== CART_STORAGE_VERSION ||
      !('items' in value) ||
      !Array.isArray(value.items) ||
      value.items.length > 100 ||
      !('updatedAt' in value) ||
      typeof value.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(value.updatedAt))
    )
      throw new Error('Invalid cart schema');
    const reconciled = reconcileItems(value.items, catalog);
    return {
      ...blank,
      cart: {
        items: reconciled.items,
        updatedAt: reconciled.messages.length ? now : value.updatedAt,
      },
      recoveryMessages: reconciled.messages,
    };
  } catch {
    return {
      ...blank,
      recoveryMessages: [
        'Não foi possível recuperar o carrinho guardado. A tua cesta foi reposta vazia.',
      ],
    };
  }
}
export function readCartStorage(catalog: readonly Product[], now: string): CartSession {
  try {
    return restoreCart(window.localStorage.getItem(CART_STORAGE_KEY), catalog, now);
  } catch {
    return {
      cart: emptyCart(now),
      feedback: null,
      recoveryMessages: [],
      storageIssue:
        'O armazenamento deste browser não está disponível. A cesta funciona apenas nesta sessão.',
    };
  }
}
export function writeCartStorage(cart: CartState): boolean {
  try {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        version: CART_STORAGE_VERSION,
        items: cart.items,
        updatedAt: cart.updatedAt,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
