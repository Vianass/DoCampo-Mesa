import { test, expect } from '@playwright/test';
import { createAuctionLiveClient } from '../src/features/auctions/live-client';
import { quickBidValue } from '../src/features/auctions/quick-bids';
import type { AuctionSnapshot } from '../src/features/auctions/contracts';
const id = '123456789012345678901234';
const initial: AuctionSnapshot = {
  leilaoId: id,
  versao: 0,
  sequencia: 0,
  estado: 'ativo',
  valorAtualCent: 1200,
  incrementoCent: 100,
  bidId: null,
  lider: null,
  iniciaEm: '2026-10-31T10:00:00Z',
  terminaEm: '2026-10-31T12:00:00Z',
  serverNow: '2026-10-31T11:00:00Z',
};
const tick = () => new Promise((r) => setTimeout(r, 5));
function fixture(reconcile: () => Promise<AuctionSnapshot>) {
  const descriptors = ['window', 'navigator'].map(
    (k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)] as const,
  );
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: Object.assign(new EventTarget(), { location: { origin: 'http://localhost' } }),
  });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  const handlers = new Map<string, (...a: unknown[]) => void>(),
    states: AuctionSnapshot[] = [],
    statuses: string[] = [],
    errors: unknown[] = [];
  const socket = {
    connected: false,
    active: true,
    io: { on: () => undefined, off: () => undefined },
    on: (e: string, f: (...a: unknown[]) => void) => {
      handlers.set(e, f);
      return socket;
    },
    removeAllListeners: () => handlers.clear(),
    connect: () => {
      socket.connected = true;
      handlers.get('connect')?.();
      return socket;
    },
    disconnect: () => {
      socket.connected = false;
      handlers.get('disconnect')?.();
      return socket;
    },
    timeout: () => socket,
    emitWithAck: async () => ({ ok: true, data: initial }),
    emit: () => undefined,
  };
  const client = createAuctionLiveClient({
    id,
    initial,
    reconcile,
    socketAuth: (done) => done({ token: 'test-memory-only' }),
    trackConnection: () => () => undefined,
    state: (s) => states.push(s),
    status: (s) => statuses.push(s),
    presence: () => undefined,
    error: (e) => errors.push(e),
    socketFactory: (() => socket) as unknown as NonNullable<
      Parameters<typeof createAuctionLiveClient>[0]['socketFactory']
    >,
  });
  return {
    client,
    handlers,
    states,
    statuses,
    errors,
    restore: () => {
      client.close();
      for (const [k, d] of descriptors) {
        if (d) Object.defineProperty(globalThis, k, d);
        else Reflect.deleteProperty(globalThis, k);
      }
    },
  };
}
test('entrada só fica pronta depois da reconciliação REST autenticada', async () => {
  let resolve!: (s: AuctionSnapshot) => void;
  const wait = new Promise<AuctionSnapshot>((r) => (resolve = r)),
    f = fixture(() => wait);
  try {
    f.client.connect();
    await tick();
    expect(f.statuses).not.toContain('connected');
    expect((await f.client.bid({ requestId: 'pending', leilaoId: id, valorCent: 1700 })).ok).toBe(
      false,
    );
    resolve(initial);
    await tick();
    expect(f.statuses.at(-1)).toBe('connected');
  } finally {
    resolve(initial);
    f.restore();
  }
});
test('REST atrasado e eventos antigos/duplicados não fazem recuar os atalhos confirmados', async () => {
  let resolve!: (s: AuctionSnapshot) => void;
  const wait = new Promise<AuctionSnapshot>((r) => (resolve = r)),
    f = fixture(() => wait);
  try {
    f.client.connect();
    await tick();
    const next = {
      ...initial,
      versao: 1,
      sequencia: 1,
      valorAtualCent: 1700,
      bidId: '223456789012345678901234',
      lider: { referencia: 'p_abcdefghijklmnopqrstuvwx' },
    };
    f.handlers.get('auction:updated')?.(next);
    resolve(initial);
    await tick();
    f.handlers.get('auction:updated')?.(next);
    f.handlers.get('auction:updated')?.(initial);
    expect(f.states.at(-1)?.valorAtualCent).toBe(1700);
    expect(quickBidValue(f.states.at(-1)!.valorAtualCent, 100, 500)).toBe(2200);
    expect(f.statuses.at(-1)).toBe('connected');
  } finally {
    resolve(initial);
    f.restore();
  }
});
test('recusa REST 401 não habilita licitações e mantém a recusa visível', async () => {
  const f = fixture(async () => {
    throw { status: 401 };
  });
  try {
    f.client.connect();
    await tick();
    expect(f.statuses.at(-1)).toBe('expired');
    expect(f.errors).toContainEqual({ status: 401 });
    expect((await f.client.bid({ requestId: 'forbidden', leilaoId: id, valorCent: 1700 })).ok).toBe(
      false,
    );
  } finally {
    f.restore();
  }
});
test('falha de rede REST recupera com consulta explícita e coalesce pedidos concorrentes', async () => {
  let fail = true,
    calls = 0;
  const f = fixture(async () => {
    calls++;
    if (fail) throw { status: 503 };
    return initial;
  });
  try {
    f.client.connect();
    await tick();
    expect(f.statuses.at(-1)).toBe('disconnected');
    fail = false;
    await Promise.all([f.client.refresh(), f.client.refresh()]);
    expect(calls).toBe(2);
    expect(f.statuses.at(-1)).toBe('connected');
  } finally {
    f.restore();
  }
});
