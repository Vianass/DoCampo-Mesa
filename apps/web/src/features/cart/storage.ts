import { demonstrationSite } from '../auth/demo-mode';
import { storedProduct, mergeCatalog } from './remote';
import type { Product } from '../../types/market';
import type { CartSession, CartState } from './types';
import { emptyCart, reconcileItems } from './model';

// O armazenamento antigo não tinha proprietário: conserva-se, mas nunca é atribuído a uma conta.
export const CART_STORAGE_KEY = demonstrationSite
  ? 'docampo.cart.demo.v1'
  : 'docampo.cart.guest.v2';
export function cartStorageKey(owner?: string) {
  return owner && !demonstrationSite ? 'docampo.cart.account.v2.' + owner : CART_STORAGE_KEY;
}
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
    const snapshots = value.items.flatMap((item: unknown) => {
      const v =
        typeof item === 'object' && item !== null && 'productSnapshot' in item
          ? storedProduct(item.productSnapshot)
          : undefined;
      return v ? [v] : [];
    });
    const reconciled = reconcileItems(value.items, mergeCatalog(snapshots, catalog));
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
export function readCartStorage(
  catalog: readonly Product[],
  now: string,
  key = CART_STORAGE_KEY,
): CartSession {
  try {
    return restoreCart(window.localStorage.getItem(key), catalog, now);
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
export function writeCartStorage(cart: CartState, key = CART_STORAGE_KEY): boolean {
  try {
    window.localStorage.setItem(
      key,
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
