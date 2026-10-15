import { useCallback, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import type { Product } from '../../types/market';
import { products } from '../../data/market';
import { CartContext } from './CartContext';
import { cartReducer, cartSummary } from './model';
import { readCartStorage, writeCartStorage } from './storage';
import type { CartOperation } from './types';

export function CartProvider({
  children,
  catalog = products,
}: {
  children: ReactNode;
  catalog?: readonly Product[];
}) {
  const [session, dispatch] = useReducer(cartReducer, catalog, (items) =>
    readCartStorage(items, new Date().toISOString()),
  );
  useEffect(() => {
    if (!writeCartStorage(session.cart)) dispatch({ type: 'storage-failure' });
  }, [session.cart]);
  useEffect(() => {
    dispatch({ type: 'reconcile', catalog, now: new Date().toISOString() });
  }, [catalog]);
  const operate = useCallback(
    (operation: CartOperation) =>
      dispatch({ type: 'operate', operation, catalog, now: new Date().toISOString() }),
    [catalog],
  );
  const summary = useMemo(() => cartSummary(session.cart, catalog), [session.cart, catalog]);
  const value = useMemo(
    () => ({
      ...session,
      ...summary,
      subtotal: summary.subtotalCents,
      total: summary.totalCents,
      addItem: (productId: string, quantity = 1) => operate({ type: 'add', productId, quantity }),
      removeItem: (productId: string) => operate({ type: 'remove', productId }),
      updateQuantity: (productId: string, quantity: number) =>
        operate({ type: 'quantity', productId, quantity }),
      clearCart: () => operate({ type: 'clear' }),
    }),
    [session, summary, operate],
  );
  return (
    <CartContext value={value}>
      {children}
      <div
        className="visually-hidden"
        aria-live="polite"
        aria-atomic="true"
        role="status"
        aria-label="Atualização do carrinho"
      >
        <span key={session.feedback?.id}>{session.feedback?.message}</span>
      </div>
    </CartContext>
  );
}
