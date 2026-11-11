import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { createConnection, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { seedAuctionActors } from '../../api/tests/support/auction-fixtures';
import { createUserModel } from '../../api/src/modules/users/user.model';
import { createProductModel } from '../../api/src/modules/products/product.model';
import { hashPassword } from '../../api/src/modules/auth/passwords';
import { inspectOrderContrast } from './support/admin-order-accessibility';
const api = 'http://127.0.0.1:3011/api';
let root: ReturnType<typeof createConnection>, db: ReturnType<typeof createConnection>;
const accounts = new Set<string>();
let scenarioStarted = 0;
let renderErrors: string[] = [];
test.beforeEach(({ page }) => {
  scenarioStarted = Date.now();
  renderErrors = [];
  page.on('console', (message) => {
    if (/Maximum update depth|Too many re-renders/.test(message.text()))
      renderErrors.push(message.text());
  });
});
test.beforeAll(async () => {
  root = await createConnection(
    'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
    { dbName: 'admin' },
  ).asPromise();
  const names = (await root.db!.admin().listDatabases()).databases.filter((v) =>
    v.name.startsWith('docampo_test_web_'),
  );
  expect(names).toHaveLength(1);
  db = root.useDb(names[0]!.name);
});
test.afterEach(async () => {
  const ids = [...accounts].map((id) => new Types.ObjectId(id));
  accounts.clear();
  const auctions = await db
    .db!.collection('auctions')
    .find({ produtor: { $in: ids } }, { projection: { _id: 1 } })
    .toArray();
  await db.db!.collection('bids').deleteMany({ leilao: { $in: auctions.map((a) => a._id) } });
  await db.db!.collection('auctions').deleteMany({ produtor: { $in: ids } });
  await db.db!.collection('products').deleteMany({ produtor: { $in: ids } });
  await db.db!.collection('producers').deleteMany({ userId: { $in: ids } });
  await db.db!.collection('users').deleteMany({ _id: { $in: ids } });
  // Todos os clientes de ensaio partilham o IP local: respeitar os 120 pedidos/minuto reais.
  const pause = 10000 - (Date.now() - scenarioStarted);
  if (pause > 0) await new Promise((resolve) => setTimeout(resolve, pause));
  expect(renderErrors).toEqual([]);
});
test.afterAll(async () => {
  await root?.close();
});
async function fixture(request: APIRequestContext, overrides: Record<string, unknown> = {}) {
  // Dados exclusivamente fictícios na base aleatória do servidor de testes; sem seeds de produção.
  const actors = await seedAuctionActors(db),
    password = 'Apenas teste 11C ' + randomUUID();
  const passwordHash = await hashPassword(password),
    users = [];
  for (const actor of [...actors.buyers, actors.seller]) {
    accounts.add(actor.id);
    const user = await createUserModel(db).findById(actor.id).orFail();
    await createUserModel(db).collection.updateOne({ _id: user._id }, { $set: { passwordHash } });
    const credentials = { email: user.emailNormalizado, password };
    const r = await request.post(api + '/auth/login', { data: credentials });
    expect(r.status()).toBe(200);
    users.push({ ...credentials, id: actor.id, token: (await r.json()).accessToken as string });
  }
  const product = await createProductModel(db).findById(actors.body.produtoId).orFail();
  product.imagens = [
    {
      url: 'http://127.0.0.1:5183/images/tomatoes.webp',
      alt: 'Tomates ilustrativos num ensaio fictício',
      principal: true,
    },
  ];
  await product.save();
  const body = {
    ...actors.body,
    titulo: 'Uma colheita para a tua oferta',
    precoBaseCent: 1200,
    incrementoCent: 100,
    terminaEm: new Date(Date.now() + 120000).toISOString(),
    ...overrides,
  };
  const r = await request.post(api + '/auctions', {
    headers: { Authorization: 'Bearer ' + users[2]!.token, 'Idempotency-Key': randomUUID() },
    data: body,
  });
  expect(r.status()).toBe(201);
  return {
    users,
    lot: await r.json(),
    etag: r.headers().etag!,
    productId: actors.body.produtoId,
    initialStock: product.stockDisponivel,
  };
}
async function navigate(page: Page, path: string) {
  await page.evaluate((p) => {
    history.pushState(null, '', p);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function enter(page: Page, user: { email: string; password: string }, id: string) {
  await page.goto('/entrar');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('.account-identity')).toBeVisible();
  await navigate(page, '/leiloes/' + id);
  await expect(page.getByText('Ligado à sala', { exact: true })).toBeVisible();
}
const count = (id: string) =>
  db.db!.collection('bids').countDocuments({ leilao: new Types.ObjectId(id) });
const amount = (page: Page) => page.getByLabel('A tua oferta pelo lote (€)', { exact: true });
const shortcut = (page: Page, delta: number) =>
  page.getByRole('button', { name: '+' + delta + ' €', exact: true });
const confirm = (page: Page) => page.getByRole('button', { name: 'Confirmar oferta', exact: true });
async function bid(
  request: APIRequestContext,
  id: string,
  token: string,
  valorCent: number,
  key = randomUUID(),
) {
  return request.post(api + '/auctions/' + id + '/bids', {
    headers: { Authorization: 'Bearer ' + token, 'Idempotency-Key': key },
    data: { valorCent },
  });
}
async function capture(page: Page, name: string) {
  const target = process.env.DOCAMPO_QUICK_BID_SCREENSHOTS;
  if (!target) return;
  await expect(page.locator('.auction-room')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const image = page.locator('.auction-room-story img');
  if (await image.count()) {
    await image.first().scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image
          .first()
          .evaluate(
            (el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0,
          ),
      )
      .toBe(true);
  }
  const contrast = await inspectOrderContrast(page, '.auction-room');
  expect(contrast.samples).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir(target, { recursive: true });
  await writeFile(
    join(target, name + '.json'),
    JSON.stringify({ viewport: page.viewportSize(), contrast, overflow: false }, null, 2),
  );
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: join(target, name + '.png'),
    fullPage: true,
    animations: 'disabled',
  });
}
test('histórico desatualizado não afirma ausência de ofertas após confirmação em direto', async ({
  page,
  request,
}) => {
  const s = await fixture(request);
  await enter(page, s.users[0]!, s.lot.id);
  await expect(page.locator('.auction-history')).toContainText('Ainda não foram aceites');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  // A resposta continua a vir da API/MongoDB reais; apenas atrasamos a rede para observar a transição.
  await page.route('**/api/auctions/' + s.lot.id + '/bids?*', async (route) => {
    await gate;
    await route.continue();
  });
  const transition = page.evaluate(
    () =>
      new Promise<{ emptyClaim: boolean; loading: boolean }>((resolve) => {
        const observer = new MutationObserver(() => {
          if (!document.querySelector('.auction-current-value')?.textContent?.includes('17,00'))
            return;
          const history = document.querySelector('.auction-history')!;
          observer.disconnect();
          resolve({
            emptyClaim: history.textContent!.includes('Ainda não foram aceites'),
            loading: !!history.querySelector('[role="status"]'),
          });
        });
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
      }),
  );
  try {
    await shortcut(page, 5).click();
    await confirm(page).click();
    expect(await transition).toEqual({ emptyClaim: false, loading: true });
    await expect(page.locator('.auction-bid-feedback')).toContainText('aceite e registada');
    expect(await count(s.lot.id)).toBe(1);
  } finally {
    release();
  }
  await expect(page.locator('.auction-bid-ledger li')).toHaveCount(1);
  await expect(page.locator('.auction-history')).toContainText('1 ofertas confirmadas');
  await capture(page, 'historico-confirmado');
});
test('os três atalhos preparam sem submeter, não acumulam, permitem editar/cancelar e só a confirmação grava', async ({
  page,
  request,
}) => {
  const s = await fixture(request);
  await enter(page, s.users[0]!, s.lot.id);
  for (const [delta, text] of [
    [5, '17,00'],
    [10, '22,00'],
    [25, '37,00'],
  ] as const) {
    await shortcut(page, delta).click();
    await expect(amount(page)).toHaveValue(text);
    await expect(shortcut(page, delta)).toHaveAttribute('aria-pressed', 'true');
    expect(await count(s.lot.id)).toBe(0);
  }
  await amount(page).fill('38,25');
  await expect(shortcut(page, 25)).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Cancelar preparação', exact: true }).click();
  await expect(confirm(page)).toBeDisabled();
  expect(await count(s.lot.id)).toBe(0);
  for (const [delta, text, value] of [
    [5, '17,00', 1700],
    [10, '27,00', 2700],
    [25, '52,00', 5200],
  ] as const) {
    await shortcut(page, delta).click();
    await expect(amount(page)).toHaveValue(text);
    await confirm(page).click();
    await expect(page.locator('.auction-bid-feedback')).toContainText('aceite e registada');
    await expect(page.getByTestId('auction-current-value')).toContainText(text);
    await expect(amount(page)).toHaveValue('');
    expect(
      (await db.db!.collection('auctions').findOne({ _id: new Types.ObjectId(s.lot.id) }))!
        .licitacaoAtual.valorCent,
    ).toBe(value);
  }
  expect(await count(s.lot.id)).toBe(3);
  const product = await db
    .db!.collection('products')
    .findOne({ _id: new Types.ObjectId(s.productId) });
  expect(product!.stockDisponivel).toBe(s.initialStock! - 500);
  await expect(page.locator('.auction-bid-ledger li')).toHaveCount(3);
  await capture(page, 'ofertas-aceites');
});
test('dupla submissão da mesma preparação confirma apenas uma licitação', async ({
  page,
  request,
}) => {
  const s = await fixture(request);
  await enter(page, s.users[0]!, s.lot.id);
  await shortcut(page, 25).click();
  await page.getByRole('form', { name: 'Apresentar oferta', exact: true }).evaluate((el) => {
    (el as HTMLFormElement).requestSubmit();
    (el as HTMLFormElement).requestSubmit();
  });
  await expect(page.getByTestId('auction-current-value')).toContainText('37,00');
  expect(await count(s.lot.id)).toBe(1);
});
test('incremento mínimo desativa apenas atalhos insuficientes e preserva a entrada manual', async ({
  page,
  request,
}) => {
  const s = await fixture(request, { incrementoCent: 1000 });
  await enter(page, s.users[0]!, s.lot.id);
  await expect(shortcut(page, 5)).toBeDisabled();
  await expect(shortcut(page, 10)).toBeEnabled();
  await amount(page).fill('21,99');
  await confirm(page).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Indica um valor igual ou superior à próxima oferta mínima.',
  );
  expect(await count(s.lot.id)).toBe(0);
  await amount(page).fill('22,01');
  await confirm(page).click();
  await expect(page.getByTestId('auction-current-value')).toContainText('22,01');
  expect(await count(s.lot.id)).toBe(1);
});
test('teto monetário mantém o último cêntimo exato e bloqueia transbordos', async ({
  page,
  request,
}) => {
  const s = await fixture(request, {
    precoBaseCent: Number.MAX_SAFE_INTEGER - 500,
    incrementoCent: 1,
  });
  await page.setViewportSize({ width: 320, height: 900 });
  await enter(page, s.users[0]!, s.lot.id);
  await expect(shortcut(page, 10)).toBeDisabled();
  await expect(shortcut(page, 25)).toBeDisabled();
  await shortcut(page, 5).click();
  await expect(amount(page)).toHaveValue('90071992547409,91');
  await expect(page.locator('.auction-prepared-value')).toContainText(',91');
  await confirm(page).click();
  await expect(page.getByTestId('auction-current-value')).toContainText(',91');
  await expect(confirm(page)).toBeDisabled();
  expect(await count(s.lot.id)).toBe(1);
  await expect(page.locator('#auction-minimum')).toHaveText(
    'Próxima oferta mínima: Limite de valor atingido',
  );
  await capture(page, '320-limite-monetario');
});
test('alteração em direto não aumenta a oferta preparada; exige revisão ou uma nova escolha', async ({
  page,
  browser,
  request,
}) => {
  const s = await fixture(request);
  await enter(page, s.users[0]!, s.lot.id);
  const context = await browser.newContext(),
    other = await context.newPage();
  try {
    await enter(other, s.users[1]!, s.lot.id);
    await shortcut(page, 5).click();
    await shortcut(other, 10).click();
    await confirm(other).click();
    await expect(page.getByTestId('auction-current-value')).toContainText('22,00');
    await expect(amount(page)).toHaveValue('17,00');
    await expect(confirm(page)).toBeDisabled();
    await expect(page.locator('.auction-prepared-value')).toContainText('não foi aumentado');
    await expect(
      page.getByRole('button', { name: 'Manter este valor', exact: true }),
    ).toBeDisabled();
    expect(await count(s.lot.id)).toBe(1);
    await capture(page, 'oferta-desatualizada');
    await shortcut(page, 5).click();
    await expect(amount(page)).toHaveValue('27,00');
    await confirm(page).click();
    await expect(other.getByTestId('auction-current-value')).toContainText('27,00');
    expect(await count(s.lot.id)).toBe(2);
  } finally {
    await context.close();
  }
});
test('dois compradores concorrentes deixam uma única oferta válida e UI converge sem dados privados', async ({
  page,
  request,
}) => {
  const s = await fixture(request);
  await enter(page, s.users[0]!, s.lot.id);
  await shortcut(page, 5).click();
  const responses = await Promise.all(
    s.users.slice(0, 2).map((u) => bid(request, s.lot.id, u.token, 1700)),
  );
  expect(responses.map((r) => r.status()).sort()).toEqual([201, 409]);
  await expect(page.getByTestId('auction-current-value')).toContainText('17,00');
  await expect(confirm(page)).toBeDisabled();
  expect(await count(s.lot.id)).toBe(1);
  await expect(page.locator('.auction-bid-ledger li')).toHaveCount(1);
  await expect(page.locator('.auction-history')).not.toContainText(s.users[1]!.email);
});
test('falha de rede bloqueia atalhos; reconexão relê REST e pode manter explicitamente um valor ainda válido', async ({
  page,
  request,
}) => {
  const s = await fixture(request);
  await enter(page, s.users[0]!, s.lot.id);
  await shortcut(page, 5).click();
  try {
    await page.context().setOffline(true);
    await page.evaluate(() => dispatchEvent(new Event('offline')));
    await expect(confirm(page)).toBeDisabled();
    await expect(shortcut(page, 5)).toBeDisabled();
    expect((await bid(request, s.lot.id, s.users[1]!.token, 1300)).status()).toBe(201);
    const reread = page.waitForResponse(
      (r) =>
        r.url() === api + '/auctions/' + s.lot.id &&
        r.request().method() === 'GET' &&
        r.status() === 200,
    );
    await page.context().setOffline(false);
    await page.evaluate(() => dispatchEvent(new Event('online')));
    await reread;
    await expect(page.getByText('Ligado à sala', { exact: true })).toBeVisible();
    await expect(page.getByTestId('auction-current-value')).toContainText('13,00');
    await expect(amount(page)).toHaveValue('17,00');
    await expect(confirm(page)).toBeDisabled();
    await page.getByRole('button', { name: 'Manter este valor', exact: true }).click();
    await confirm(page).click();
    await expect(page.getByTestId('auction-current-value')).toContainText('17,00');
    expect(await count(s.lot.id)).toBe(2);
  } finally {
    await page.context().setOffline(false);
  }
});
test('tentativa persistida recupera recibo com o mesmo valor/chave; atalhos não substituem o pedido incerto', async ({
  page,
  request,
}) => {
  const s = await fixture(request),
    key = randomUUID();
  expect((await bid(request, s.lot.id, s.users[0]!.token, 1700, key)).status()).toBe(201);
  await enter(page, s.users[0]!, s.lot.id);
  await navigate(page, '/leiloes');
  await expect(page.locator('.auction-room')).toHaveCount(0);
  await page.evaluate(
    async ({ id, userId, key }) => {
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode('docampo-auctions:' + userId),
      );
      const hash = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, '0')).join(
        '',
      );
      sessionStorage.setItem(
        'docampo.auction-attempt.v1.' + hash + '.' + id,
        JSON.stringify({ requestId: key, leilaoId: id, valorCent: 1700 }),
      );
    },
    { id: s.lot.id, userId: s.users[0]!.id, key },
  );
  await navigate(page, '/leiloes/' + s.lot.id);
  await expect(
    page.getByRole('button', { name: 'Recuperar resultado da oferta', exact: true }),
  ).toBeEnabled();
  await expect(shortcut(page, 5)).toBeDisabled();
  await expect(confirm(page)).toBeDisabled();
  await capture(page, 'resultado-incerto');
  await page.getByRole('button', { name: 'Recuperar resultado da oferta', exact: true }).click();
  await expect(page.locator('.auction-bid-feedback')).toContainText(
    'recuperámos a tua tentativa original',
  );
  expect(await count(s.lot.id)).toBe(1);
  expect((await bid(request, s.lot.id, s.users[0]!.token, 2200, key)).status()).toBe(409);
});
test('leilão terminado bloqueia a preparação e a API recusa submissão tardia', async ({
  page,
  request,
}) => {
  const s = await fixture(request, { terminaEm: new Date(Date.now() + 8000).toISOString() });
  await enter(page, s.users[0]!, s.lot.id);
  await shortcut(page, 5).click();
  await expect(page.getByText('Este lote terminou sem ofertas.', { exact: true })).toBeVisible({
    timeout: 18000,
  });
  for (const d of [5, 10, 25]) await expect(shortcut(page, d)).toBeDisabled();
  await expect(confirm(page)).toBeDisabled();
  expect((await bid(request, s.lot.id, s.users[0]!.token, 1700)).status()).toBe(409);
  expect(await count(s.lot.id)).toBe(0);
  await capture(page, 'leilao-terminado');
});
test('cancelamento confirmado, ausência de capacidade, JWT inválido e suspensão não são contornados', async ({
  page,
  request,
}) => {
  const s = await fixture(request);
  await enter(page, s.users[0]!, s.lot.id);
  expect((await bid(request, s.lot.id, 'invalid-test-token', 1700)).status()).toBe(401);
  expect((await bid(request, s.lot.id, s.users[2]!.token, 1700)).status()).toBe(403);
  const cancel = await request.post(api + '/auctions/' + s.lot.id + '/cancel', {
    headers: { Authorization: 'Bearer ' + s.users[2]!.token, 'If-Match': s.etag },
    data: {},
  });
  expect(cancel.status()).toBe(200);
  await expect(
    page.getByText('Este leilão foi cancelado. Não aceita ofertas.', { exact: true }),
  ).toBeVisible();
  await expect(shortcut(page, 5)).toBeDisabled();
  const second = await request.post(api + '/auctions', {
    headers: { Authorization: 'Bearer ' + s.users[2]!.token, 'Idempotency-Key': randomUUID() },
    data: {
      produtoId: s.productId,
      quantidade: 500,
      titulo: 'Ensaio de suspensão',
      descricao: 'Dados fictícios',
      precoBaseCent: 1200,
      incrementoCent: 100,
      terminaEm: new Date(Date.now() + 60000).toISOString(),
    },
  });
  expect(second.status()).toBe(201);
  const id = (await second.json()).id;
  await navigate(page, '/leiloes/' + id);
  await expect(shortcut(page, 5)).toBeEnabled();
  await shortcut(page, 5).click();
  await db
    .db!.collection('users')
    .updateOne({ _id: new Types.ObjectId(s.users[0]!.id) }, { $set: { ativo: false } });
  expect((await bid(request, id, s.users[0]!.token, 1700)).status()).toBe(401);
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  await expect(
    page.getByRole('link', { name: 'Entrar para acompanhar', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.auction-quick-bids')).toHaveCount(0);
  expect(await count(id)).toBe(0);
});
for (const width of [320, 430, 768, 1024, 1280, 1440])
  test(
    'atalhos reais, teclado, confirmação e histórico a ' + width + ' px',
    async ({ page, request }) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width, height: 940 });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const s = await fixture(request);
      await enter(page, s.users[0]!, s.lot.id);
      const button = shortcut(page, 5);
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(amount(page)).toHaveValue('17,00');
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(await count(s.lot.id)).toBe(0);
      await capture(page, width + '-oferta-preparada');
      await amount(page).focus();
      await page.keyboard.press('Tab');
      await expect(confirm(page)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('auction-current-value')).toContainText('17,00');
      await expect(page.locator('.auction-bid-ledger li')).toHaveCount(1);
      await capture(page, width + '-oferta-aceite');
      expect(await count(s.lot.id)).toBe(1);
      expect(errors).toEqual([]);
    },
  );
