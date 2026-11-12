import { mergeCatalog } from './remote';
import { onCatalogRefresh } from '../api/catalog-events';
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
import { readCartStorage, writeCartStorage, CART_STORAGE_KEY, cartStorageKey } from './storage';
import { useAuth } from '../auth/useAuth';
import type { CartOperation, CartPurchaseLine } from './types';
import { readPending } from '../checkout/model';

function readTouches(touchKey: string): Record<string, string> {
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
  const { session: account } = useAuth();
  const owner = account.kind === 'authenticated' ? account.user.id : undefined;
  const storageKey = cartStorageKey(owner);
  const touchKey = storageKey + '.touches';
  const [scoped, send] = useReducer(
    (
      state: { key: string; session: import('./types').CartSession },
      event: {
        key: string;
        action?: import('./types').CartAction;
        replacement?: import('./types').CartSession;
      },
    ) => {
      if (event.replacement) return { key: event.key, session: event.replacement };
      if (event.key !== state.key || !event.action) return state;
      return { key: state.key, session: cartReducer(state.session, event.action) };
    },
    storageKey,
    (key) => ({ key, session: readCartStorage(baseCatalog, new Date().toISOString(), key) }),
  );
  // Atualização durante o render: React descarta o render antigo antes de apresentar os filhos.
  // O resto da aplicação não é desmontado: login e navegação mantêm o ciclo normal.
  if (scoped.key !== storageKey)
    send({
      key: storageKey,
      replacement: readCartStorage(baseCatalog, new Date().toISOString(), storageKey),
    });
  const session = scoped.session;
  const dispatch = useCallback(
    (action: import('./types').CartAction) => send({ key: storageKey, action }),
    [storageKey],
  );
  const latest = useRef({ key: storageKey, cart: session.cart });
  useLayoutEffect(() => {
    latest.current = { key: storageKey, cart: session.cart };
  }, [session.cart, storageKey, dispatch]);
  const touches = useRef({ key: storageKey, values: readTouches(touchKey) });
  useLayoutEffect(() => {
    touches.current = { key: storageKey, values: readTouches(touchKey) };
  }, [storageKey, touchKey]);
  const [, setGuestVersion] = useState(0);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      if (event.key === storageKey || event.key === null) {
        touches.current = { key: storageKey, values: readTouches(touchKey) };
        dispatch({
          type: 'restore',
          session: readCartStorage(baseCatalog, new Date().toISOString(), storageKey),
        });
      }
      if (event.key === CART_STORAGE_KEY || event.key === null) setGuestVersion((v) => v + 1);
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [storageKey, touchKey, baseCatalog, dispatch]);
  const [remoteRefresh, setRemoteRefresh] = useState(0);
  useEffect(() => onCatalogRefresh(() => setRemoteRefresh((v) => v + 1)), []);
  const mark = useCallback(
    (ids: readonly string[]) => {
      const current = {
        ...(touches.current.key === storageKey ? touches.current.values : {}),
        ...readTouches(touchKey),
      };
      for (const id of ids) current[id] = crypto.randomUUID();
      const values = Object.fromEntries(Object.entries(current).slice(-300));
      if (touches.current.key === storageKey) touches.current = { key: storageKey, values };
      try {
        localStorage.setItem(touchKey, JSON.stringify(values));
      } catch {
        /* Falha: não apagar escolhas. */
      }
    },
    [storageKey, touchKey],
  );
  const snapshotPurchase = useCallback(() => {
    if (latest.current.key !== storageKey) return [];
    const items = latest.current.cart.items;
    const values =
      touches.current.key === storageKey ? touches.current.values : readTouches(touchKey);
    const missing = items.filter((i) => !values[i.productId]).map((i) => i.productId);
    if (missing.length) mark(missing);
    const current = readTouches(touchKey);
    return items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      stamp: current[i.productId] ?? values[i.productId] ?? crypto.randomUUID(),
      signature: cartSignature(i),
    }));
  }, [storageKey, touchKey, mark]);
  const acknowledgePurchase = useCallback(
    (lines: readonly CartPurchaseLine[]) => {
      const current = {
        ...(touches.current.key === storageKey ? touches.current.values : {}),
        ...readTouches(touchKey),
      };
      dispatch({
        type: 'purchase-confirmed',
        lines: lines.filter((l) => current[l.productId] === l.stamp),
        now: new Date().toISOString(),
      });
      setRemoteRefresh((n) => n + 1);
    },
    [touchKey, storageKey, dispatch],
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
        const pending = readPending(owner);
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
  }, [remoteIds, remoteRefresh, owner, dispatch]);
  useEffect(() => {
    if (!writeCartStorage(session.cart, storageKey)) dispatch({ type: 'storage-failure' });
  }, [session.cart, storageKey, dispatch]);
  useEffect(() => {
    dispatch({ type: 'reconcile', catalog, now: new Date().toISOString() });
  }, [catalog, dispatch]);
  const operate = useCallback(
    (operation: CartOperation, product?: Product) => {
      mark(
        operation.type === 'clear'
          ? latest.current.cart.items.map((i) => i.productId)
          : [operation.productId],
      );
      dispatch({
        type: 'operate',
        operation,
        catalog: product ? mergeCatalog(catalog, [product]) : catalog,
        now: new Date().toISOString(),
      });
    },
    [catalog, mark, dispatch],
  );
  const summary = useMemo(() => cartSummary(session.cart, catalog), [session.cart, catalog]);
  const guestCartAvailable = !!(
    owner && readCartStorage(baseCatalog, new Date().toISOString()).cart.items.length
  );
  const importGuestCart = useCallback(() => {
    if (!owner) return;
    const guest = readCartStorage(baseCatalog, new Date().toISOString()).cart;
    const merged = mergeCatalog(
      catalog,
      guest.items.flatMap((i) => (i.productSnapshot ? [i.productSnapshot] : [])),
    );
    let next = session;
    for (const item of guest.items) {
      next = cartReducer(next, {
        type: 'operate',
        operation: { type: 'add', productId: item.productId, quantity: item.quantity },
        catalog: merged,
        now: new Date().toISOString(),
      });
      if (next.feedback?.kind === 'error') {
        dispatch({ type: 'restore', session: { ...session, feedback: next.feedback } });
        return;
      }
    }
    if (!writeCartStorage({ items: [], updatedAt: new Date().toISOString() })) {
      dispatch({ type: 'storage-failure' });
      return;
    }
    if (!writeCartStorage(next.cart, storageKey)) {
      writeCartStorage(guest);
      dispatch({ type: 'storage-failure' });
      return;
    }
    mark(guest.items.map((i) => i.productId));
    dispatch({ type: 'restore', session: next });
    setGuestVersion((v) => v + 1);
  }, [owner, baseCatalog, catalog, session, storageKey, dispatch, mark]);
  const value = useMemo(
    () => ({
      ...session,
      ...summary,
      guestCartAvailable,
      importGuestCart,
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
    [
      session,
      summary,
      operate,
      remoteIssue,
      snapshotPurchase,
      acknowledgePurchase,
      guestCartAvailable,
      importGuestCart,
    ],
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
