import { test, expect } from '@playwright/test';
import { createAdminAuctionFeed } from '../src/features/admin-auctions/admin-live-client';
function fixture() {
  const saved = ['window', 'document'].map(
    (k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)] as const,
  );
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: Object.assign(new EventTarget(), { location: { origin: 'http://localhost' } }),
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
  });
  const listeners = new Map<string, (v?: unknown) => void>(),
    calls: string[] = [],
    statuses: string[] = [];
  let refreshes = 0,
    untracked = 0,
    denied = 0;
  let answer: unknown = { ok: true, data: { subscrito: true } };
  const socket = {
    connected: false,
    on: (event: string, fn: (v?: unknown) => void) => {
      listeners.set(event, fn);
      return socket;
    },
    connect: () => {
      socket.connected = true;
      listeners.get('connect')?.();
      return socket;
    },
    disconnect: () => {
      socket.connected = false;
      listeners.get('disconnect')?.();
      return socket;
    },
    removeAllListeners: () => listeners.clear(),
    timeout: () => socket,
    emitWithAck: async (event: string) => {
      calls.push(event);
      return answer;
    },
  };
  const client = createAdminAuctionFeed({
    socketAuth: (done) => done({ token: 'fixture-memory-only' }),
    trackConnection: () => () => untracked++,
    refresh: () => refreshes++,
    status: (s) => statuses.push(s),
    denied: () => denied++,
    socketFactory: (() => socket) as unknown as NonNullable<
      Parameters<typeof createAdminAuctionFeed>[0]['socketFactory']
    >,
    throttleMs: 5,
    recoveryMs: 100000,
  });
  return {
    client,
    socket,
    listeners,
    calls,
    statuses,
    refreshes: () => refreshes,
    denied: () => denied,
    untracked: () => untracked,
    answer: (v: unknown) => (answer = v),
    close() {
      client.close();
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}
const settle = () => new Promise((r) => setTimeout(r, 25));
test('subscrição global só pede leitura e coalesce duplicados/eventos fora de ordem', async () => {
  const f = fixture();
  try {
    f.client.connect();
    await settle();
    expect(f.calls).toEqual(['admin:auctions:watch']);
    const before = f.refreshes();
    for (const version of [3, 2, 3, 1, 3])
      f.listeners.get('admin:auctions:changed')?.({
        consultar: true,
        versao: version,
        valorCent: 999999,
      });
    await settle();
    expect(f.refreshes()).toBe(before + 1);
    expect(f.calls).not.toContain('auction:bid');
    expect(f.statuses).toContain('connected');
  } finally {
    f.close();
  }
});
test('reconexão volta a subscrever e obriga a reler a API', async () => {
  const f = fixture();
  try {
    f.client.connect();
    await settle();
    const before = f.refreshes();
    f.socket.disconnect();
    f.socket.connect();
    await settle();
    expect(f.calls).toEqual(['admin:auctions:watch', 'admin:auctions:watch']);
    expect(f.refreshes()).toBeGreaterThan(before);
  } finally {
    f.close();
  }
});
test('recusa administrativa é terminal e fecha a subscrição, sem a mascarar como reconexão', async () => {
  const f = fixture();
  try {
    f.answer({ ok: false, erro: { status: 403 } });
    f.client.connect();
    await settle();
    expect(f.statuses.at(-1)).toBe('forbidden');
    expect(f.denied()).toBe(1);
    expect(f.refreshes()).toBe(0);
  } finally {
    f.close();
  }
});
test('cleanup cancela atualizações pendentes e liberta a ligação uma só vez', async () => {
  const f = fixture();
  try {
    f.client.connect();
    await settle();
    const before = f.refreshes();
    f.listeners.get('admin:auctions:changed')?.({ consultar: true });
    f.client.close();
    f.client.close();
    await settle();
    expect(f.refreshes()).toBe(before);
    expect(f.untracked()).toBe(1);
    expect(f.listeners.size).toBe(0);
  } finally {
    f.close();
  }
});
