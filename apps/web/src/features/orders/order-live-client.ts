import { io } from 'socket.io-client';
import { socketOrigin } from '../auctions/live-client';
import { record, number } from '../auctions/contracts';
import { objectId, InvalidResponse } from '../api/catalog-contract';
import { orderStates } from '../checkout/contracts';
export function parseOrderUpdate(v: unknown) {
  const r = record(v);
  if (
    Object.keys(r).sort().join(',') !== 'atualizadaEm,encomendaId,estado,versao' ||
    typeof r.encomendaId !== 'string' ||
    !objectId(r.encomendaId) ||
    !orderStates.includes(r.estado as never) ||
    typeof r.atualizadaEm !== 'string' ||
    !Number.isFinite(Date.parse(r.atualizadaEm))
  )
    throw new InvalidResponse();
  return {
    encomendaId: r.encomendaId,
    estado: r.estado as string,
    versao: number(r.versao),
    atualizadaEm: r.atualizadaEm,
  };
}
export type OrderConnection = 'a_ligar' | 'ligada' | 'indisponivel';
export function createOrderLiveClient(options: {
  socketAuth: (done: (auth: { token: string }) => void) => void;
  trackConnection: (close: () => void) => () => void;
  changed: () => void;
  status: (s: OrderConnection) => void;
  accessLost: () => void;
  socketFactory?: typeof io;
}) {
  const socket = (options.socketFactory ?? io)(socketOrigin() + '/orders', {
    autoConnect: false,
    forceNew: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 5000,
    auth: (done) => {
      try {
        options.socketAuth(done);
      } catch {
        done({});
      }
    },
  });
  let subscribed = false,
    subscribing = false;
  let closed = false,
    pending: ReturnType<typeof setTimeout> | undefined;
  const versions = new Map<string, number>();
  function reconcile() {
    if (closed || pending) return;
    pending = setTimeout(() => {
      pending = undefined;
      if (!closed) options.changed();
    }, 80);
  }
  function failure(v: unknown) {
    subscribed = false;
    options.status('indisponivel');
    try {
      const r = record(v);
      if (r.status === 401 || r.status === 403) {
        socket.disconnect();
        options.accessLost();
      }
    } catch {
      /* Falha de transporte sem detalhes privados. */
    }
    reconcile();
  }
  function subscribe() {
    if (closed || subscribing) return;
    subscribing = true;
    socket.timeout(5000).emit('orders:watch', {}, (error: unknown, response: unknown) => {
      subscribing = false;
      if (closed) return;
      try {
        if (error) throw error;
        const r = record(response);
        if (r.ok !== true) {
          failure(r.erro);
          return;
        }
        subscribed = true;
        options.status('ligada');
        reconcile();
      } catch {
        failure({});
      }
    });
  }
  socket.on('connect', subscribe);
  socket.on('order:updated', (v) => {
    if (closed) return;
    try {
      const next = parseOrderUpdate(v);
      if (next.versao <= (versions.get(next.encomendaId) ?? -1)) return;
      if (versions.size >= 1000 && !versions.has(next.encomendaId)) versions.clear();
      versions.set(next.encomendaId, next.versao);
      reconcile();
    } catch {
      reconcile();
    }
  });
  socket.on('orders:error', failure);
  socket.on('disconnect', () => {
    if (!closed) {
      subscribed = false;
      subscribing = false;
      options.status('indisponivel');
      reconcile();
    }
  });
  socket.on('connect_error', (e) => {
    if (!closed) failure(e.data ?? {});
  });
  function refresh() {
    if (!closed) {
      if (!socket.connected) socket.connect();
      else if (!subscribed) subscribe();
      reconcile();
    }
  }
  function visible() {
    if (document.visibilityState === 'visible') refresh();
  }
  window.addEventListener('online', refresh);
  window.addEventListener('focus', visible);
  document.addEventListener('visibilitychange', visible);
  // Recupera também perdas silenciosas sem depender da entrega do Socket.IO.
  const timer = setInterval(visible, 15000);
  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(pending);
    clearInterval(timer);
    window.removeEventListener('online', refresh);
    window.removeEventListener('focus', visible);
    document.removeEventListener('visibilitychange', visible);
    socket.removeAllListeners();
    socket.disconnect();
  }
  const untrack = options.trackConnection(close);
  options.status('a_ligar');
  socket.connect();
  return {
    refresh,
    close() {
      close();
      untrack();
    },
  };
}
