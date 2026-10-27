import { mergeCatalog } from './remote';
import { adaptProduct, catalogApi } from '../api/catalog';
import { ApiFailure } from '../api/client';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Product } from '../../types/market';
import { products } from '../../data/market';
import { CartContext } from './CartContext';
import { cartReducer, cartSummary, cartSignature } from './model';
import { readCartStorage, writeCartStorage, CART_STORAGE_KEY } from './storage';
import type { CartOperation, CartPurchaseLine } from './types';
import { readPending } from '../checkout/model';

const touchKey = CART_STORAGE_KEY + '.touches';
function readTouches(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(touchKey) ?? '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(
      Object.entries(v).flatMap(([key, value]) =>
        key.length < 200 && typeof value === 'string' && value.length < 100 ? [[key, value]] : [],
      ),
    );
  } catch {
    return {};
  }
}

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
  const latest = useRef(session.cart);
  useLayoutEffect(() => {
    latest.current = session.cart;
  }, [session.cart]);
  const touches = useRef<Record<string, string>>(readTouches());
  const [remoteRefresh, setRemoteRefresh] = useState(0);
  function mark(ids: readonly string[]) {
    touches.current = { ...touches.current, ...readTouches() };
    for (const id of ids) touches.current[id] = crypto.randomUUID();
    const entries = Object.entries(touches.current).slice(-300);
    touches.current = Object.fromEntries(entries);
    try {
      localStorage.setItem(touchKey, JSON.stringify(touches.current));
    } catch {
      /* Uma falha conserva as linhas por precaução no reload. */
    }
  }
  const snapshotPurchase = useCallback(() => {
    const items = latest.current.items;
    const missing = items.filter((i) => !touches.current[i.productId]).map((i) => i.productId);
    if (missing.length) mark(missing);
    return items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      stamp: touches.current[i.productId]!,
      signature: cartSignature(i),
    }));
  }, []);
  const acknowledgePurchase = useCallback((lines: readonly CartPurchaseLine[]) => {
    const current = { ...touches.current, ...readTouches() };
    dispatch({
      type: 'purchase-confirmed',
      lines: lines.filter((l) => current[l.productId] === l.stamp),
      now: new Date().toISOString(),
    });
    setRemoteRefresh((n) => n + 1);
  }, []);
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
        const pending = readPending();
        const protectedIds = new Set(
          !pending?.confirmed ? pending?.baseline.map((line) => line.productId) : [],
        );
        // Uma atualização pública não pode retirar escolhas de uma compra ainda por confirmar.
        // A tentativa original mantém as suas ofertas; só o checkout decide o resultado.
        dispatch({
          type: 'refresh',
          catalog: mergeCatalog(
            baseCatalog,
            updates.filter((product) => !protectedIds.has(product.id)),
          ),
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
  }, [remoteIds, remoteRefresh]);
  useEffect(() => {
    if (!writeCartStorage(session.cart)) dispatch({ type: 'storage-failure' });
  }, [session.cart]);
  useEffect(() => {
    dispatch({ type: 'reconcile', catalog, now: new Date().toISOString() });
  }, [catalog]);
  const operate = useCallback(
    (operation: CartOperation, product?: Product) => {
      mark(
        operation.type === 'clear'
          ? latest.current.items.map((i) => i.productId)
          : [operation.productId],
      );
      dispatch({
        type: 'operate',
        operation,
        catalog: product ? mergeCatalog(catalog, [product]) : catalog,
        now: new Date().toISOString(),
      });
    },
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
      snapshotPurchase,
      acknowledgePurchase,
    }),
    [session, summary, operate, remoteIssue, snapshotPurchase, acknowledgePurchase],
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
