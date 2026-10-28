import { io, type Socket } from 'socket.io-client';
import { apiBase } from '../api/client';
import {
  parseSnapshot,
  parseReceipt,
  record,
  type AuctionSnapshot,
  type BidReceipt,
} from './contracts';
import { mergeSnapshot } from './model';
import type { BidAttempt } from './attempts';
export type LiveStatus =
  'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'expired' | 'forbidden';
export interface LiveFault {
  status: number;
  codigo?: string;
  uncertain?: boolean;
}
type Reply<T> =
  | { ok: true; data: T }
  | { ok: false; erro: { status: number; codigo?: string; resultadoIncerto?: boolean } };
interface Incoming {
  'auction:updated': (v: unknown) => void;
  'auction:ended': (v: unknown) => void;
  'auction:presence': (v: unknown) => void;
  'auction:error': (v: unknown) => void;
}
interface Outgoing {
  'auction:join': (v: { leilaoId: string }, ack: (r: unknown) => void) => void;
  'auction:state': (v: { leilaoId: string }, ack: (r: unknown) => void) => void;
  'auction:leave': (v: { leilaoId: string }, ack: (r: unknown) => void) => void;
  'auction:bid': (v: BidAttempt, ack: (r: unknown) => void) => void;
}
function fault(v: unknown): LiveFault {
  try {
    const e = record(v);
    return {
      status: typeof e.status === 'number' ? e.status : 500,
      codigo: typeof e.codigo === 'string' ? e.codigo : undefined,
      uncertain: e.resultadoIncerto === true,
    };
  } catch {
    return { status: 500, uncertain: true };
  }
}
export function socketOrigin(base = apiBase(), locationOrigin = window.location.origin) {
  return base.startsWith('/') ? locationOrigin : new URL(base).origin;
}
export function createAuctionLiveClient(options: {
  id: string;
  initial: AuctionSnapshot;
  socketAuth: (done: (auth: { token: string }) => void) => void;
  trackConnection: (close: () => void) => () => void;
  state: (state: AuctionSnapshot, received: number, sent?: number) => void;
  status: (status: LiveStatus) => void;
  presence: (count: number) => void;
  error: (error: LiveFault) => void;
  socketFactory?: typeof io;
}) {
  let current = options.initial,
    closed = false,
    joined = false,
    submitting = false,
    offline = !navigator.onLine,
    terminalStatus: LiveStatus | undefined,
    refreshing: Promise<void> | undefined;
  const socket: Socket<Incoming, Outgoing> = (options.socketFactory ?? io)(
    socketOrigin() + '/auctions',
    {
      path: '/socket.io',
      autoConnect: false,
      forceNew: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      auth: (done) => {
        try {
          options.socketAuth(done);
        } catch {
          options.status('expired');
          done({});
        }
      },
    },
  );
  function apply(value: unknown, sent?: number) {
    const next = parseSnapshot(value);
    if (next.leilaoId !== options.id) throw Error('Estado inválido.');
    const result = mergeSnapshot(current, next);
    if (result.invalid) throw Error('Estado inconsistente.');
    if (next.versao < current.versao) return;
    current = result.state;
    options.state(current, performance.now(), sent);
    if (result.gap)
      queueMicrotask(() => {
        if (!closed) void refresh();
      });
  }
  async function query(event: 'auction:join' | 'auction:state') {
    const sent = performance.now();
    const raw = await socket.timeout(10000).emitWithAck(event, { leilaoId: options.id });
    const r = record(raw);
    if (!r.ok) throw fault(r.erro);
    apply(r.data, sent);
    if (closed) return;
    joined = true;
    options.status(offline ? 'reconnecting' : 'connected');
  }
  async function refresh() {
    if (closed) return;
    if (!socket.connected) {
      socket.connect();
      return;
    }
    return (refreshing ??= query(joined ? 'auction:state' : 'auction:join')
      .catch((error) => {
        if (closed) return;
        const f = typeof error?.status === 'number' ? (error as LiveFault) : { status: 503 };
        options.error(f);
        options.status(
          f.status === 401 ? 'expired' : f.status === 403 ? 'forbidden' : 'disconnected',
        );
      })
      .finally(() => {
        refreshing = undefined;
      }));
  }
  function changed(v: unknown) {
    if (closed) return;
    try {
      apply(v);
      if (joined && !offline) options.status('connected');
    } catch {
      options.error({ status: 503 });
      options.status('reconnecting');
      void refresh();
    }
  }
  function error(v: unknown) {
    const f = fault(v);
    if (closed) return;
    options.error(f);
    if (f.status === 401 || f.status === 403) {
      joined = false;
      terminalStatus = f.status === 401 ? 'expired' : 'forbidden';
      options.status(terminalStatus);
      socket.disconnect();
    } else if (f.status >= 500) {
      options.status('reconnecting');
    }
  }
  socket.on('connect', () => {
    if (closed) return;
    joined = false;
    terminalStatus = undefined;
    options.status('connecting');
    void refresh();
  });
  socket.on('connect_error', (e) => {
    if (closed) return;
    const f = fault('data' in e ? e.data : { status: 503 });
    options.error(f);
    options.status(f.status === 401 ? 'expired' : f.status === 403 ? 'forbidden' : 'reconnecting');
  });
  socket.on('disconnect', () => {
    joined = false;
    if (!closed)
      options.status(terminalStatus ?? (socket.active ? 'reconnecting' : 'disconnected'));
  });
  socket.on('auction:updated', changed);
  socket.on('auction:ended', changed);
  socket.on('auction:error', error);
  socket.on('auction:presence', (v) => {
    try {
      const p = record(v);
      if (
        p.leilaoId === options.id &&
        typeof p.ligacoes === 'number' &&
        Number.isSafeInteger(p.ligacoes) &&
        p.ligacoes >= 0 &&
        !closed
      )
        options.presence(p.ligacoes);
    } catch {
      /* Não apresentar contagens inválidas. */
    }
  });
  const retrying = () => {
    if (!closed) options.status('reconnecting');
  };
  socket.io.on('reconnect_attempt', retrying);
  const offlineEvent = () => {
    offline = true;
    options.status('reconnecting');
  };
  const onlineEvent = () => {
    offline = false;
    void refresh();
  };
  window.addEventListener('offline', offlineEvent);
  window.addEventListener('online', onlineEvent);
  const untrack = options.trackConnection(close);
  function close() {
    if (closed) return;
    closed = true;
    if (socket.connected && joined)
      socket.emit('auction:leave', { leilaoId: options.id }, () => undefined);
    window.removeEventListener('offline', offlineEvent);
    window.removeEventListener('online', onlineEvent);
    socket.removeAllListeners();
    socket.io.off('reconnect_attempt', retrying);
    socket.disconnect();
    untrack();
  }
  return {
    connect() {
      if (!closed) socket.connect();
    },
    refresh,
    close,
    async bid(attempt: BidAttempt): Promise<Reply<BidReceipt>> {
      if (closed || offline || !joined || !socket.connected || submitting)
        return {
          ok: false,
          erro: { status: 503, codigo: 'LIGACAO_INDISPONIVEL', resultadoIncerto: true },
        };
      submitting = true;
      try {
        const r = record(await socket.timeout(12000).emitWithAck('auction:bid', attempt));
        if (closed) return { ok: false, erro: { status: 503, resultadoIncerto: true } };
        if (r.ok !== true) {
          const f = fault(r.erro);
          return {
            ok: false,
            erro: {
              status: f.status,
              codigo: f.codigo,
              resultadoIncerto: f.uncertain || f.status >= 500,
            },
          };
        }
        const receipt = parseReceipt(r.data);
        if (
          receipt.requestId !== attempt.requestId ||
          receipt.licitacao.leilaoId !== attempt.leilaoId ||
          receipt.licitacao.valorCent !== attempt.valorCent
        )
          throw Error();
        apply(receipt.estado);
        return { ok: true, data: receipt };
      } catch {
        return {
          ok: false,
          erro: { status: 503, codigo: 'RESULTADO_DESCONHECIDO', resultadoIncerto: true },
        };
      } finally {
        submitting = false;
      }
    },
  };
}
