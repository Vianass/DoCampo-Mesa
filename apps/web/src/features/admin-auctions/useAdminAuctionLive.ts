import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { createAuctionLiveClient, type LiveStatus } from '../auctions/live-client';
import { createAdminAuctionFeed } from './admin-live-client';
import { toSnapshot, type AdminAuction } from './contracts';
/** Uma subscrição global na listagem, uma sala normal no detalhe; sem comandos de licitação. */
export function useAdminAuctionLive(refresh: () => void, detail?: AdminAuction, detailId?: string) {
  const { session, socketAuth, trackConnection, revalidate } = useAuth(),
    owner =
      session.kind === 'authenticated' && session.user.papeis.includes('administrador')
        ? session.user.id + ':' + session.expiresAt
        : '',
    id = detailId ?? detail?.id,
    ready = !id || !!detail,
    key = owner + ':' + (id ?? 'global');
  const callback = useRef(refresh),
    seed = useRef(detail);
  useEffect(() => {
    callback.current = refresh;
    seed.current = detail;
  }, [refresh, detail]);
  const [state, setState] = useState<{ key: string; status: LiveStatus; expected: number }>();
  useEffect(() => {
    if (!owner || !ready) return;
    let active = true,
      expected = seed.current?.versao ?? 0,
      last: LiveStatus | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const requestRefresh = () => {
      if (!active || refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        if (active) callback.current();
      }, 1500);
    };
    const status = (value: LiveStatus) => {
      if (active) {
        setState({ key, status: value, expected });
        if (id && value === 'connected' && last !== 'connected') requestRefresh();
        last = value;
      }
    };
    const connection =
      id && seed.current
        ? createAuctionLiveClient({
            id,
            initial: toSnapshot(seed.current),
            socketAuth,
            trackConnection,
            status,
            presence: () => undefined,
            state: (s) => {
              if (active && s.versao > expected) {
                expected = s.versao;
                setState({ key, status: last ?? 'connecting', expected });
                requestRefresh();
              }
            },
            error: (e) => {
              if (e.status === 401 || e.status === 403) void revalidate();
            },
          })
        : createAdminAuctionFeed({
            socketAuth,
            trackConnection,
            status,
            refresh: () => callback.current(),
            denied: () => void revalidate(),
          });
    // StrictMode limpa o primeiro efeito de desenvolvimento antes desta microtask.
    // Não iniciar um handshake de uma ligação já desmontada.
    queueMicrotask(() => {
      if (active) connection.connect();
    });
    const recovery = id
      ? setInterval(() => {
          if (active && document.visibilityState === 'visible') requestRefresh();
        }, 15000)
      : undefined;
    return () => {
      active = false;
      clearTimeout(refreshTimer);
      clearInterval(recovery);
      connection.close();
    };
  }, [key, owner, id, ready, socketAuth, trackConnection, revalidate]);
  return state?.key === key && ready
    ? state
    : { key, status: 'connecting' as const, expected: detail?.versao ?? 0 };
}
