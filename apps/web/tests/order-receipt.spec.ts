import { test, expect } from './support/test';
import { parseOrderUpdate } from '../src/features/orders/order-live-client';
import { parseReceiptOrder } from '../src/features/orders/receipt-contract';
import { orderFixture } from './support/checkout-fixtures';
import { mockAccount, accountLogin } from './support/auth-fixtures';
const tag = '"' + 'A'.repeat(43) + '"';
const fixture = () => ({
  ...orderFixture(),
  estado: 'pronta',
  versao: 3,
  podeConfirmarRececao: true,
  rececao: { confirmadaEm: null, concluidaEm: null },
});
test('contrato de receção exige ETag e ação coerente com pronta; não habilita fixtures antigas', () => {
  expect(parseReceiptOrder(fixture(), { etag: tag }).podeConfirmarRececao).toBe(true);
  expect(() => parseReceiptOrder(fixture(), { etag: null })).toThrow();
  expect(() => parseReceiptOrder({ ...fixture(), estado: 'pendente' }, { etag: tag })).toThrow();
  expect(parseReceiptOrder(orderFixture(), { etag: null }).podeConfirmarRececao).toBeUndefined();
});
test('contrato de evento rejeita dados privados, estados inválidos e versões não inteiras', () => {
  const v = {
    encomendaId: fixture().id,
    estado: 'pronta',
    versao: 3,
    atualizadaEm: '2026-10-31T10:00:00Z',
  };
  expect(parseOrderUpdate(v).versao).toBe(3);
  for (const extra of [
    { email: 'privado' },
    { versao: -1 },
    { versao: 1.5 },
    { estado: 'entregue' },
    { atualizadaEm: 'inválida' },
  ])
    expect(() => parseOrderUpdate({ ...v, ...extra })).toThrow();
});
test('cliente deduplica versões, ignora eventos antigos e reconcilia após nova ligação', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/src/features/orders/order-live-client.ts',
      { createOrderLiveClient } = await import(/* @vite-ignore */ path);
    const callbacks = new Map<string, (v?: unknown) => void>();
    let changes = 0,
      closes = 0;
    const fake = {
      connected: true,
      on(name: string, cb: (v?: unknown) => void) {
        callbacks.set(name, cb);
        return fake;
      },
      timeout() {
        return {
          emit(_name: string, _value: unknown, cb: (error: unknown, v: unknown) => void) {
            cb(null, { ok: true, data: { consultar: true } });
          },
        };
      },
      connect() {
        callbacks.get('connect')?.();
      },
      disconnect() {
        closes++;
      },
      removeAllListeners() {
        callbacks.clear();
      },
    };
    const client = createOrderLiveClient({
      socketFactory: () => fake,
      socketAuth: () => undefined,
      trackConnection: () => () => undefined,
      status: () => undefined,
      accessLost: () => undefined,
      changed: () => changes++,
    });
    const wait = () => new Promise((resolve) => setTimeout(resolve, 120));
    await wait();
    const initial = changes;
    const v = {
      encomendaId: '000000000000000000000001',
      estado: 'concluida',
      versao: 4,
      atualizadaEm: '2026-10-31T10:00:00Z',
    };
    callbacks.get('order:updated')?.(v);
    await wait();
    const accepted = changes;
    callbacks.get('order:updated')?.(v);
    callbacks.get('order:updated')?.({ ...v, versao: 3, estado: 'pronta' });
    await wait();
    const duplicate = changes;
    callbacks.get('connect')?.();
    await wait();
    const reconnected = changes;
    client.close();
    return { initial, accepted, duplicate, reconnected, closes };
  });
  expect(result.initial).toBe(1);
  expect(result.accepted).toBe(2);
  expect(result.duplicate).toBe(2);
  expect(result.reconnected).toBe(3);
  expect(result.closes).toBe(1);
});
for (const failure of [412, 503])
  test(
    'confirmação HTTP ' + failure + ' bloqueia repetição até consulta explícita',
    async ({ page }) => {
      await mockAccount(page);
      let calls = 0;
      await page.route('**/api/orders/**', async (route) => {
        if (route.request().method() === 'PATCH') {
          calls++;
          await route.fulfill({ status: failure, json: { codigo: 'PRECONDICAO_FALHOU' } });
        } else await route.fulfill({ headers: { ETag: tag }, json: fixture() });
      });
      await accountLogin(page);
      await page.evaluate((path) => {
        history.pushState(null, '', path);
        dispatchEvent(new PopStateEvent('popstate'));
      }, '/area/comprador/encomendas/' + fixture().id);
      await page.getByRole('button', { name: 'Confirmar receção', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Continuar análise', exact: true }),
      ).toBeFocused();
      await page.getByRole('button', { name: 'Sim, recebi a encomenda', exact: true }).click();
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Confirmar receção', exact: true }),
      ).toBeDisabled();
      expect(calls).toBe(1);
      await page
        .getByRole('button', { name: 'Consultar estado antes de repetir', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: 'Confirmar receção', exact: true }),
      ).toBeEnabled();
    },
  );
