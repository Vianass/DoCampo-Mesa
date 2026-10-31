import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/useAuth';
import { useLocation } from 'react-router';
import { OrderUpdatesContext } from './OrderUpdatesContext';
import { createOrderLiveClient, type OrderConnection } from './order-live-client';
export function OrderUpdatesProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation(),
    relevant =
      /^\/area\/(comprador\/(encomendas|avaliacoes)(\/|$)|produtor(\/?$|\/encomendas(\/|$)))/.test(
        pathname,
      );
  const { session, socketAuth, trackConnection, revalidate } = useAuth(),
    owner =
      relevant &&
      session.kind === 'authenticated' &&
      session.user.papeis.some((r) => r === 'comprador' || r === 'produtor')
        ? session.user.id + ':' + session.expiresAt + ':' + session.user.papeis.join(',')
        : '',
    [state, setState] = useState({ owner: '', revision: 0, status: 'a_ligar' as OrderConnection }),
    client = useRef<ReturnType<typeof createOrderLiveClient> | undefined>(undefined);
  useEffect(() => {
    if (!owner) return;
    let active = true;
    const recover = () => {
      void revalidate();
      client.current?.refresh();
    };
    window.addEventListener('online', recover);
    client.current = createOrderLiveClient({
      socketAuth,
      trackConnection,
      changed() {
        if (active)
          setState((s) => ({
            owner,
            revision: s.owner === owner ? s.revision + 1 : 1,
            status: s.owner === owner ? s.status : 'a_ligar',
          }));
      },
      status(status) {
        if (active)
          setState((s) => ({ owner, revision: s.owner === owner ? s.revision : 0, status }));
      },
      accessLost() {
        if (active) void revalidate();
      },
    });
    return () => {
      active = false;
      window.removeEventListener('online', recover);
      client.current?.close();
      client.current = undefined;
    };
  }, [owner, socketAuth, trackConnection, revalidate]);
  return (
    <OrderUpdatesContext
      value={{
        revision: state.owner === owner ? state.revision : 0,
        status: state.owner === owner ? state.status : 'a_ligar',
        refresh: () => client.current?.refresh(),
      }}
    >
      {children}
    </OrderUpdatesContext>
  );
}
