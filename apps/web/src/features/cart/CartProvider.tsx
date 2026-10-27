import { mergeCatalog } from './remote';
import { adaptProduct, catalogApi } from '../api/catalog';
import { ApiFailure } from '../api/client';
import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import type { Product } from '../../types/market';
import { products } from '../../data/market';
import { CartContext } from './CartContext';
import { cartReducer, cartSummary } from './model';
import { readCartStorage, writeCartStorage } from './storage';
import type { CartOperation } from './types';

export function CartProvider({
  children,
  catalog: baseCatalog = products,
}: {
  children: ReactNode;
  catalog?: readonly Product[];
}) {
  const [session, dispatch] = useReducer(cartReducer, baseCatalog, (items) =>
    readCartStorage(items, new Date().toISOString()),
  );
  const catalog = useMemo(
    () =>
      mergeCatalog(
        baseCatalog,
        session.cart.items.flatMap((i) => (i.productSnapshot ? [i.productSnapshot] : [])),
      ),
    [baseCatalog, session.cart.items],
  );
  const [remoteIssue, setRemoteIssue] = useState<string>();
  const remoteIds = session.cart.items
    .filter((i) => i.productSnapshot?.source === 'api')
    .map((i) => i.productId)
    .sort()
    .join(',');
  useEffect(() => {
    if (!remoteIds) return;
    const controller = new AbortController();
    let active = true;
    const ids = remoteIds.split(',');
    void (async () => {
      const updates: Product[] = [];
      let failed = false;
      // Limite de quatro pedidos simultâneos; não descarrega o catálogo completo.
      for (let offset = 0; offset < ids.length; offset += 4) {
        await Promise.all(
          ids.slice(offset, offset + 4).map(async (id) => {
            try {
              updates.push(adaptProduct(await catalogApi.product(id, controller.signal)));
            } catch (error) {
              if (error instanceof ApiFailure && error.status === 404) {
                const existing = catalog.find((p) => p.id === id);
                if (existing) updates.push({ ...existing, availableStock: 0 });
              } else failed = true;
            }
          }),
        );
        if (!active) return;
      }
      if (active) {
        dispatch({
          type: 'refresh',
          catalog: mergeCatalog(baseCatalog, updates),
          now: new Date().toISOString(),
        });
        setRemoteIssue(
          failed
            ? 'Não foi possível atualizar todos os produtos da cesta. As escolhas guardadas foram preservadas; os valores são uma estimativa local.'
            : undefined,
        );
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
    // A composição muda em operações da cesta; apenas mudanças de IDs iniciam nova consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteIds]);
  useEffect(() => {
    if (!writeCartStorage(session.cart)) dispatch({ type: 'storage-failure' });
  }, [session.cart]);
  useEffect(() => {
    dispatch({ type: 'reconcile', catalog, now: new Date().toISOString() });
  }, [catalog]);
  const operate = useCallback(
    (operation: CartOperation, product?: Product) =>
      dispatch({
        type: 'operate',
        operation,
        catalog: product ? mergeCatalog(catalog, [product]) : catalog,
        now: new Date().toISOString(),
      }),
    [catalog],
  );
  const summary = useMemo(() => cartSummary(session.cart, catalog), [session.cart, catalog]);
  const value = useMemo(
    () => ({
      ...session,
      ...summary,
      remoteIssue,
      subtotal: summary.subtotalCents,
      total: summary.totalCents,
      addItem: (productId: string, quantity = 1, product?: Product) =>
        operate({ type: 'add', productId, quantity }, product),
      removeItem: (productId: string) => operate({ type: 'remove', productId }),
      updateQuantity: (productId: string, quantity: number) =>
        operate({ type: 'quantity', productId, quantity }),
      clearCart: () => operate({ type: 'clear' }),
    }),
    [session, summary, operate, remoteIssue],
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
