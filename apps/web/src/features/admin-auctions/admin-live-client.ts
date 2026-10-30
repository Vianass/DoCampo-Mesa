import { io } from 'socket.io-client';
import { socketOrigin, type LiveStatus } from '../auctions/live-client';
import { record } from '../auctions/contracts';
/** Apenas invalida leituras. Nenhum campo comercial de um evento substitui a API. */
export function createAdminAuctionFeed(options: {
  socketAuth: (done: (auth: { token: string }) => void) => void;
  trackConnection: (close: () => void) => () => void;
  refresh: () => void;
  status: (v: LiveStatus) => void;
  denied: () => void;
  socketFactory?: typeof io;
  throttleMs?: number;
  recoveryMs?: number;
}) {
  let closed = false,
    joined = false,
    watching = false,
    terminal: LiveStatus | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  const socket = (options.socketFactory ?? io)(socketOrigin() + '/auctions', {
    path: '/socket.io',
    forceNew: true,
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    auth: (done) => {
      try {
        options.socketAuth(done);
      } catch {
        options.status('expired');
        done({});
      }
    },
  });
  function refresh() {
    if (closed || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (!closed && document.visibilityState === 'visible') options.refresh();
    }, options.throttleMs ?? 1500);
  }
  function denied(status: number) {
    terminal = status === 401 ? 'expired' : 'forbidden';
    joined = false;
    options.status(terminal);
    options.denied();
    socket.disconnect();
  }
  async function watch() {
    if (closed || !socket.connected || watching || terminal) return;
    watching = true;
    try {
      const raw = await socket.timeout(10000).emitWithAck('admin:auctions:watch', {});
      if (closed) return;
      const r = record(raw);
      if (r.ok !== true) {
        const error = record(r.erro);
        if (error.status === 401 || error.status === 403) denied(error.status);
        else options.status('reconnecting');
        return;
      }
      if (record(r.data).subscrito !== true) throw Error();
      joined = true;
      options.status('connected');
      refresh();
    } catch {
      if (!closed) options.status('reconnecting');
    } finally {
      watching = false;
    }
  }
  socket.on('connect', () => {
    if (closed) return;
    joined = false;
    options.status('connecting');
    void watch();
  });
  socket.on('admin:auctions:changed', (raw) => {
    try {
      if (record(raw).consultar === true) refresh();
    } catch {
      /* Evento inválido não representa estado. */
    }
  });
  socket.on('disconnect', () => {
    joined = false;
    if (!closed) options.status(terminal ?? 'reconnecting');
  });
  socket.on('connect_error', () => {
    if (!closed) options.status('reconnecting');
  });
  socket.on('auction:error', (raw) => {
    try {
      const r = record(raw);
      if (r.status === 401 || r.status === 403) {
        denied(r.status);
        return;
      }
    } catch {
      /* Recuperar por REST. */
    }
    refresh();
  });
  const recover = setInterval(() => {
      if (!joined && !terminal) void watch();
      refresh();
    }, options.recoveryMs ?? 15000),
    focus = () => {
      if (document.visibilityState === 'visible') {
        if (!socket.connected && !terminal) socket.connect();
        else if (!joined && !terminal) void watch();
        refresh();
      }
    };
  window.addEventListener('online', focus);
  window.addEventListener('focus', focus);
  document.addEventListener('visibilitychange', focus);
  const untrack = options.trackConnection(close);
  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    clearInterval(recover);
    window.removeEventListener('online', focus);
    window.removeEventListener('focus', focus);
    document.removeEventListener('visibilitychange', focus);
    socket.removeAllListeners();
    socket.disconnect();
    untrack();
  }
  return {
    connect() {
      if (!closed) socket.connect();
    },
    close,
  };
}
