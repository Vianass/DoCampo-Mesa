import { test, expect } from '@playwright/test';
import { createAuctionLiveClient, socketOrigin } from '../src/features/auctions/live-client';
import type { AuctionSnapshot } from '../src/features/auctions/contracts';
import { createAccountSession } from '../src/features/auth/account-session';
import type { AccountUser } from '../src/features/auth/types';
const id = '123456789012345678901234',
  bidId = '223456789012345678901234',
  ref = 'p_abcdefghijklmnopqrstuvwx';
const initial: AuctionSnapshot = {
  leilaoId: id,
  versao: 0,
  sequencia: 0,
  estado: 'ativo',
  valorAtualCent: 1200,
  incrementoCent: 100,
  bidId: null,
  lider: null,
  iniciaEm: '2026-10-28T10:00:00Z',
  terminaEm: '2026-10-28T11:00:00Z',
  serverNow: '2026-10-28T10:00:00Z',
};
function fixture() {
  const descriptors = ['window', 'navigator'].map(
    (k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)] as const,
  );
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: Object.assign(new EventTarget(), { location: { origin: 'http://localhost' } }),
  });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  const listeners = new Map<string, (...args: unknown[]) => void>(),
    manager = new Map<string, () => void>();
  const calls: string[] = [],
    states: AuctionSnapshot[] = [],
    statuses: string[] = [],
    faults: unknown[] = [];
  let answer: unknown = { ok: true, data: initial },
    tracked = 0,
    untracked = 0;
  const s = {
    connected: false,
    active: true,
    io: {
      on: (e: string, f: () => void) => manager.set(e, f),
      off: (e: string) => manager.delete(e),
    },
    on: (e: string, f: (...a: unknown[]) => void) => {
      listeners.set(e, f);
      return s;
    },
    removeAllListeners: () => listeners.clear(),
    connect: () => {
      s.connected = true;
      listeners.get('connect')?.();
      return s;
    },
    disconnect: () => {
      s.connected = false;
      listeners.get('disconnect')?.();
      return s;
    },
    timeout: () => s,
    emitWithAck: async (e: string) => {
      calls.push(e);
      if (answer instanceof Error) throw answer;
      return answer;
    },
    emit: (e: string) => calls.push(e),
  };
  const client = createAuctionLiveClient({
    id,
    initial,
    socketAuth: (done) => done({ token: 'memory-test-only' }),
    trackConnection: () => {
      tracked++;
      return () => untracked++;
    },
    state: (v) => states.push(v),
    status: (v) => statuses.push(v),
    presence: () => undefined,
    error: (v) => faults.push(v),
    socketFactory: (() => s) as unknown as NonNullable<
      Parameters<typeof createAuctionLiveClient>[0]['socketFactory']
    >,
  });
  return {
    client,
    s,
    calls,
    states,
    statuses,
    faults,
    listeners,
    manager,
    answer: (v: unknown) => {
      answer = v;
    },
    tracked: () => [tracked, untracked],
    restore: () => {
      client.close();
      for (const [k, d] of descriptors) {
        if (d) Object.defineProperty(globalThis, k, d);
        else Reflect.deleteProperty(globalThis, k);
      }
    },
  };
}
async function settle() {
  await new Promise((r) => setTimeout(r, 10));
}
test('namespace acompanha a origem da API sem incluir caminho ou token', () => {
  expect(socketOrigin('/api', 'http://local')).toBe('http://local');
  expect(socketOrigin('https://api.example.invalid/api', 'http://local')).toBe(
    'https://api.example.invalid',
  );
});
test('entrada e saída da sala; cleanup remove listeners e liberta a sessão uma única vez', async () => {
  const f = fixture();
  try {
    f.client.connect();
    await settle();
    expect(f.calls).toEqual(['auction:join']);
    expect(f.statuses.at(-1)).toBe('connected');
    f.client.close();
    f.client.close();
    expect(f.calls.at(-1)).toBe('auction:leave');
    expect(f.listeners.size).toBe(0);
    expect(f.manager.size).toBe(0);
    expect(f.tracked()).toEqual([1, 1]);
  } finally {
    f.restore();
  }
});
test('evento antigo é ignorado e lacuna consulta estado persistido', async () => {
  const f = fixture();
  try {
    f.client.connect();
    await settle();
    const newer = { ...initial, versao: 3 };
    f.answer({ ok: true, data: newer });
    f.listeners.get('auction:updated')?.(newer);
    await settle();
    expect(f.calls).toContain('auction:state');
    const count = f.states.length;
    f.listeners.get('auction:updated')?.(initial);
    expect(f.states).toHaveLength(count);
    expect(f.states.at(-1)?.versao).toBe(3);
  } finally {
    f.restore();
  }
});
test('estado inconsistente pede reconciliação; confirmação restaura ligação', async () => {
  const f = fixture();
  try {
    f.client.connect();
    await settle();
    f.listeners.get('auction:updated')?.({ ...initial, valorAtualCent: 1500 });
    await settle();
    expect(f.faults.length).toBeGreaterThan(0);
    expect(f.calls).toContain('auction:state');
    expect(f.states.at(-1)?.valorAtualCent).toBe(1200);
    expect(f.statuses.at(-1)).toBe('connected');
  } finally {
    f.restore();
  }
});
test('reconexão entra novamente na sala em vez de assumir presença anterior', async () => {
  const f = fixture();
  try {
    f.client.connect();
    await settle();
    f.s.disconnect();
    expect(f.statuses.at(-1)).toBe('reconnecting');
    f.s.connect();
    await settle();
    expect(f.calls.filter((c) => c === 'auction:join')).toHaveLength(2);
  } finally {
    f.restore();
  }
});
test('sem ligação nenhuma licitação é aceite por antecipação', async () => {
  const f = fixture();
  try {
    const r = await f.client.bid({ leilaoId: id, requestId: 'original', valorCent: 1300 });
    expect(r).toMatchObject({ ok: false, erro: { resultadoIncerto: true } });
    expect(f.calls).not.toContain('auction:bid');
  } finally {
    f.restore();
  }
});
test('acknowledgement confirmado aceita oferta e preserva recibo correlacionado', async () => {
  const f = fixture();
  try {
    f.client.connect();
    await settle();
    const state = {
      ...initial,
      versao: 1,
      sequencia: 1,
      valorAtualCent: 1300,
      bidId,
      lider: { referencia: ref },
    };
    f.answer({
      ok: true,
      data: {
        requestId: 'original',
        origem: 'nova',
        licitacao: {
          id: bidId,
          leilaoId: id,
          valorCent: 1300,
          sequencia: 1,
          aceiteEm: initial.serverNow,
          participante: { referencia: ref, proprio: true },
        },
        estado: state,
      },
    });
    expect(
      await f.client.bid({ leilaoId: id, requestId: 'original', valorCent: 1300 }),
    ).toMatchObject({ ok: true, data: { origem: 'nova' } });
    expect(f.states.at(-1)?.valorAtualCent).toBe(1300);
  } finally {
    f.restore();
  }
});
test('ack perdido mantém resultado incerto e não repete automaticamente', async () => {
  const f = fixture();
  try {
    f.client.connect();
    await settle();
    f.answer(new Error('transport'));
    expect(
      await f.client.bid({ leilaoId: id, requestId: 'original', valorCent: 1300 }),
    ).toMatchObject({ ok: false, erro: { resultadoIncerto: true } });
    await settle();
    expect(f.calls.filter((c) => c === 'auction:bid')).toHaveLength(1);
  } finally {
    f.restore();
  }
});
test('rejeição 409 difere de resultado incerto', async () => {
  const f = fixture();
  try {
    f.client.connect();
    await settle();
    f.answer({ ok: false, erro: { status: 409, codigo: 'LEILAO_NAO_ATIVO' } });
    expect(
      await f.client.bid({ leilaoId: id, requestId: 'original', valorCent: 1300 }),
    ).toMatchObject({ ok: false, erro: { status: 409, resultadoIncerto: false } });
  } finally {
    f.restore();
  }
});
test('sessão expirada e ausência de permissão encerram a ligação privada', async () => {
  for (const status of [401, 403]) {
    const f = fixture();
    try {
      f.client.connect();
      await settle();
      f.listeners.get('auction:error')?.({ status });
      expect(f.statuses.at(-1)).toBe(status === 401 ? 'expired' : 'forbidden');
      expect(f.s.connected).toBe(false);
    } finally {
      f.restore();
    }
  }
});
test('offline bloqueia oferta e retoma consulta ao regressar', async () => {
  const f = fixture();
  try {
    f.client.connect();
    await settle();
    window.dispatchEvent(new Event('offline'));
    expect(f.statuses.at(-1)).toBe('reconnecting');
    expect(
      await f.client.bid({ leilaoId: id, requestId: 'original', valorCent: 1300 }),
    ).toMatchObject({ ok: false });
    window.dispatchEvent(new Event('online'));
    await settle();
    expect(f.calls).toContain('auction:state');
  } finally {
    f.restore();
  }
});
for (const mode of ['logout', 'expiration'] as const)
  test('sessão real do cliente encerra recursos Socket em ' + mode, async () => {
    let now = Date.now(),
      closed = 0;
    const user: AccountUser = {
      id,
      nome: 'Conta fictícia',
      email: 'ficticio@example.invalid',
      papeis: ['comprador'],
    };
    const token = 'token-exclusivo-do-teste-em-memoria';
    const session = createAccountSession(
      {
        register: async () => undefined,
        login: async () => ({
          accessToken: token,
          tokenType: 'Bearer' as const,
          expiresAt: new Date(now + 10000).toISOString(),
          utilizador: user,
        }),
        me: async () => user,
        logout: async () => undefined,
      },
      () => now,
    );
    try {
      expect(() => session.socketAuth(() => undefined)).toThrow();
      await session.login({ email: user.email, password: 'Valor fictício de teste' });
      session.trackConnection(() => {
        closed++;
      });
      let observed = '';
      session.socketAuth((auth) => {
        observed = auth.token;
      });
      expect(observed).toBe(token);
      expect(JSON.stringify(session.getSnapshot())).not.toContain(token);
      if (mode === 'logout') await session.logout();
      else {
        now += 11000;
        await session.revalidate();
      }
      expect(closed).toBe(1);
      expect(session.getSnapshot().session.kind).toBe('visitor');
      expect(() => session.socketAuth(() => undefined)).toThrow();
      session.dispose();
      expect(closed).toBe(1);
    } finally {
      session.dispose();
    }
  });
