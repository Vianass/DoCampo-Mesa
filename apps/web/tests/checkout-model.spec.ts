import { expect, test } from '@playwright/test';
import {
  localInstant,
  declaredWindows,
  checkoutBody,
  savePending,
  readPending,
  clearPending,
  pendingPurchaseKey,
  type PendingPurchase,
} from '../src/features/checkout/model';
import {
  parseReceipt,
  parseOrderDetail,
  parsePreparation,
  parseRecoveredAttempt,
} from '../src/features/checkout/contracts';
import { cartReducer, cartSignature } from '../src/features/cart/model';
import type { CartItem, CartSession } from '../src/features/cart/types';
import { adaptProduct } from '../src/features/api/catalog';
import { createAccountSession } from '../src/features/auth/account-session';
import type { AuthApi } from '../src/features/auth/auth-api';
import { fixtureUser, fixtureToken, fixturePassword } from './support/auth-fixtures';
import {
  preparationFixture,
  receiptFixture,
  orderFixture,
  checkoutProduct,
} from './support/checkout-fixtures';
const reference = '12345678-1234-4234-8234-123456789abc';
const pending: PendingPurchase = {
  referencia: reference,
  submitted: true,
  confirmed: false,
  cleaned: false,
  baseline: [],
};
function memory(work: (storage: Storage) => void) {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
    clear: () => data.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    work(storage);
  } finally {
    if (old) Object.defineProperty(globalThis, 'localStorage', old);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
for (const [date, time, zone, expected] of [
  ['2026-11-02', '09:00', 'Europe/Lisbon', '2026-11-02T09:00:00.000Z'],
  ['2026-07-06', '09:00', 'Europe/Lisbon', '2026-07-06T08:00:00.000Z'],
  ['2026-11-02', '09:00', 'Asia/Kathmandu', '2026-11-02T03:15:00.000Z'],
  ['2026-03-08', '02:30', 'America/New_York', undefined],
  ['2026-11-01', '01:30', 'America/New_York', undefined],
  ['2026-02-31', '09:00', 'Europe/Lisbon', undefined],
  ['2026-11-02', '09:00', 'Fuso/Inexistente', undefined],
] as const)
  test(`hora declarada ${date} ${time} ${zone}`, () => {
    expect(localInstant(date, time, zone)).toBe(expected);
  });
test('janelas são exclusivamente as declaradas no dia e no fuso do produtor', () => {
  const windows = [{ diaSemana: 1, inicio: '09:00', fim: '12:00' }];
  expect(declaredWindows('2026-11-02', windows, 'Europe/Lisbon')).toEqual([
    {
      label: '09:00–12:00',
      periodo: {
        inicioEm: '2026-11-02T09:00:00.000Z',
        fimEm: '2026-11-02T12:00:00.000Z',
        fusoHorario: 'Europe/Lisbon',
      },
    },
  ]);
  expect(declaredWindows('2026-11-03', windows, 'Europe/Lisbon')).toEqual([]);
  expect(declaredWindows('2026-11-31', windows, 'Europe/Lisbon')).toEqual([]);
});
test('não escolhe implicitamente janelas com extremos ambíguos ou inexistentes', () => {
  expect(
    declaredWindows(
      '2026-11-01',
      [{ diaSemana: 7, inicio: '01:00', fim: '03:00' }],
      'America/New_York',
    ),
  ).toEqual([]);
});
test('pedido de compra omite nome, stock, subtotais e identidade compradora', () => {
  const prep = preparationFixture(),
    p = prep.produtores[0]!;
  const choice = {
    produtorContaId: p.produtorContaId,
    modalidade: 'levantamento' as const,
    periodo: {
      inicioEm: '2026-11-02T09:00:00.000Z',
      fimEm: '2026-11-02T12:00:00.000Z',
      fusoHorario: 'Europe/Lisbon',
    },
    metodoPagamento: 'dinheiro',
    taxaEntregaAceiteCent: 0,
    revisaoProdutorObservada: p.revisaoProdutorObservada,
  };
  const body = checkoutBody(prep, [choice]);
  expect(Object.keys(body.linhas[0]!).sort()).toEqual([
    'ofertaAceite',
    'produtoId',
    'produtorContaId',
    'quantidade',
  ]);
  expect(Object.keys(body)).toEqual(['linhas', 'condicoesPorProdutor']);
  expect(() => checkoutBody(prep, [])).toThrow();
});
test('referência local exclui pedido, morada, contacto e credenciais mesmo se houver campos adicionais', () =>
  memory((storage) => {
    const value = {
      ...pending,
      pedido: { morada: 'Morada privada fictícia' },
      password: 'Não guardar',
      accessToken: 'Não guardar',
    };
    expect(savePending(value)).toBe(true);
    const raw = storage.getItem(pendingPurchaseKey)!;
    for (const field of ['pedido', 'morada', 'password', 'accessToken'])
      expect(raw).not.toContain(field);
    expect(readPending()).toEqual(pending);
  }));
test('leitura e limpeza não substituem outra referência', () =>
  memory((storage) => {
    savePending(pending);
    clearPending('outra');
    expect(readPending()).toEqual(pending);
    clearPending(reference);
    expect(readPending()).toBeUndefined();
    storage.setItem(pendingPurchaseKey, '{invalido');
    expect(readPending()).toBeUndefined();
  }));
test('quota indisponível é reportada sem continuar silenciosamente', () =>
  memory((storage) => {
    storage.setItem = () => {
      throw new Error('Quota fictícia');
    };
    expect(savePending(pending)).toBe(false);
  }));
test('confirmação só retira as linhas exatas incluídas na compra', () => {
  const product = adaptProduct(checkoutProduct),
    item: CartItem = {
      productId: product.id,
      producerId: product.producerId,
      quantity: 1,
      unitPriceSnapshotCents: product.priceCents,
      unit: product.unit,
      productSnapshot: product,
    };
  const session: CartSession = {
    cart: {
      items: [item, { ...item, productId: 'outro-produto' }],
      updatedAt: '2026-10-27T00:00:00Z',
    },
    feedback: null,
    recoveryMessages: [],
    storageIssue: null,
  };
  const line = {
    productId: item.productId,
    quantity: 1,
    stamp: 'versao-publica',
    signature: cartSignature(item),
  };
  expect(
    cartReducer(session, {
      type: 'purchase-confirmed',
      lines: [line],
      now: session.cart.updatedAt,
    }).cart.items.map((i) => i.productId),
  ).toEqual(['outro-produto']);
  const changed = { ...session, cart: { ...session.cart, items: [{ ...item, quantity: 2 }] } };
  expect(
    cartReducer(changed, { type: 'purchase-confirmed', lines: [line], now: session.cart.updatedAt })
      .cart.items[0]!.quantity,
  ).toBe(2);
});
for (const [index, value] of [
  null,
  { ...receiptFixture(), totalCent: 999 },
  { ...receiptFixture(), encomendas: [] },
  { ...receiptFixture(), origem: 'simulado' },
].entries())
  test('recibo incompleto ou incoerente não confirma a compra ' + index, () => {
    expect(() => parseReceipt(value)).toThrow();
  });
test('DTO de encomenda minimiza campos privados e conserva os snapshots', () => {
  const parsed = parseOrderDetail({
    ...orderFixture(),
    comprador: 'conta-privada',
    idempotencia: { hashCanonico: 'privado' },
    passwordHash: 'privado',
  });
  expect(parsed.totalCent).toBe(checkoutProduct.precoCent);
  expect(parsed.entrega?.localLevantamento).toBe('Local declarado fictício');
  expect(JSON.stringify(parsed)).not.toContain('passwordHash');
  expect(JSON.stringify(parsed)).not.toContain('hashCanonico');
});
test('preparação e recuperação são validadas antes de usar os dados', () => {
  expect(
    parsePreparation(preparationFixture()).linhas[0]!.ofertaAceite.revisaoProdutoObservada,
  ).toBe(0);
  expect(() => parsePreparation({ ...preparationFixture(), produtores: [] })).toThrow();
  expect(() => parseRecoveredAttempt({ referencia: reference, expiraEm: 'invalida' })).toThrow();
});
function authApi(): AuthApi {
  return {
    register: async () => undefined,
    login: async () => ({
      accessToken: fixtureToken,
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      utilizador: fixtureUser,
    }),
    me: async () => fixtureUser,
    logout: async () => undefined,
  };
}
test('transporte autenticado usa o token privado no header e não o expõe no estado', async () => {
  const original = globalThis.fetch,
    session = createAccountSession(authApi());
  let header: HeadersInit | undefined;
  globalThis.fetch = async (_input, init) => {
    header = init?.headers;
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await session.login({ email: fixtureUser.email, password: fixturePassword });
    await session.request('/orders', (v) => v);
    expect((header as Record<string, string>).Authorization).toBe('Bearer ' + fixtureToken);
    expect(JSON.stringify(session.getSnapshot())).not.toContain(fixtureToken);
  } finally {
    session.dispose();
    globalThis.fetch = original;
  }
});
test('401 em operação privada limpa a sessão e mantém erros sem detalhes internos', async () => {
  const original = globalThis.fetch,
    session = createAccountSession(authApi());
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ codigo: 'AUTENTICACAO_INVALIDA', mensagem: 'Dados privados internos' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  try {
    await session.login({ email: fixtureUser.email, password: fixturePassword });
    await expect(session.request('/orders', (v) => v)).rejects.toMatchObject({ status: 401 });
    expect(session.getSnapshot().session.kind).toBe('visitor');
  } finally {
    session.dispose();
    globalThis.fetch = original;
  }
});
test('resposta privada antiga não sobrevive ao logout', async () => {
  const original = globalThis.fetch,
    session = createAccountSession(authApi());
  let release!: (r: Response) => void;
  globalThis.fetch = () => new Promise((r) => (release = r));
  try {
    await session.login({ email: fixtureUser.email, password: fixturePassword });
    const operation = session.request('/orders', (v) => v).catch((error) => error);
    await session.logout();
    release(new Response('{}', { headers: { 'content-type': 'application/json' } }));
    expect(await operation).toMatchObject({ name: 'AbortError' });
    expect(session.getSnapshot().session.kind).toBe('visitor');
  } finally {
    session.dispose();
    globalThis.fetch = original;
  }
});

test('total previsto soma subtotais e uma taxa por produtor sem recalcular preços', async () => {
  const { estimatedCheckoutTotal } = await import('../src/features/checkout/model');
  const prep = preparationFixture(),
    id = prep.produtores[0]!.produtorContaId;
  expect(estimatedCheckoutTotal(prep, {})).toEqual({
    produtosCent: checkoutProduct.precoCent,
    taxasCent: 0,
    totalCent: checkoutProduct.precoCent,
  });
  expect(estimatedCheckoutTotal(prep, { [id + '.modalidade']: 'entrega' })).toEqual({
    produtosCent: checkoutProduct.precoCent,
    taxasCent: 250,
    totalCent: checkoutProduct.precoCent + 250,
  });
});
