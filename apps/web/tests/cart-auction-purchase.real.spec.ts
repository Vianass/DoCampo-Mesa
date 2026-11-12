import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createConnection, Types } from 'mongoose';
import { seedAuctionActors } from '../../api/tests/support/auction-fixtures';
import { createUserModel } from '../../api/src/modules/users/user.model';
import { hashPassword } from '../../api/src/modules/auth/passwords';
import { cartStorageKey } from '../src/features/cart/storage';
const api = 'http://127.0.0.1:3011/api';
let root: ReturnType<typeof createConnection>, db: ReturnType<typeof createConnection>;
const scenarios: Awaited<ReturnType<typeof seedAuctionActors>>[] = [];
test.beforeAll(async () => {
  root = await createConnection(
    'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
    { dbName: 'admin' },
  ).asPromise();
  const names = (await root.db!.admin().listDatabases()).databases.filter((d) =>
    d.name.startsWith('docampo_test_web_'),
  );
  expect(names).toHaveLength(1);
  db = root.useDb(names[0]!.name);
});
test.afterEach(async () => {
  for (const s of scenarios.splice(0)) {
    const actors = [s.seller, ...s.buyers].map((a) => new Types.ObjectId(a.id));
    const lots = await db
      .db!.collection('auctions')
      .find({ produtor: actors[0] }, { projection: { _id: 1 } })
      .toArray();
    await db.db!.collection('bids').deleteMany({ leilao: { $in: lots.map((a) => a._id) } });
    await db.db!.collection('auctions').deleteMany({ produtor: actors[0] });
    await db.db!.collection('orders').deleteMany({ produtor: actors[0] });
    await db.db!.collection('checkout_attempts').deleteMany({ comprador: { $in: actors } });
    await db.db!.collection('products').deleteMany({ produtor: actors[0] });
    await db.db!.collection('producers').deleteMany({ userId: actors[0] });
    await db.db!.collection('users').deleteMany({ _id: { $in: actors } });
  }
});
test.afterAll(async () => {
  await root?.close();
});
async function seed(request: APIRequestContext) {
  const s = await seedAuctionActors(db);
  scenarios.push(s);
  const password = 'Frase fictícia de revisão ' + randomUUID();
  for (const a of [s.seller, ...s.buyers]) {
    const u = await createUserModel(db).findById(a.id).select('+passwordHash').orFail();
    u.passwordHash = await hashPassword(password);
    await u.save();
  }
  await db.db!.collection('products').updateOne(
    { _id: s.scenario.products[0]!._id },
    {
      $set: {
        imagens: [
          {
            url: 'http://127.0.0.1:5183/images/tomatoes.webp',
            principal: true,
            alt: 'Fotografia ilustrativa',
          },
        ],
      },
    },
  );
  const login = await request.post(api + '/auth/login', {
    data: { email: s.seller.email, password },
  });
  expect(login.status()).toBe(200);
  return { ...s, password, sellerToken: (await login.json()).accessToken as string };
}
type Seed = Awaited<ReturnType<typeof seed>>;
async function navigate(page: Page, path: string) {
  await page.evaluate((p) => {
    history.pushState(null, '', p);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function login(page: Page, s: Seed, actor = s.buyers[0]!) {
  await page.goto('/entrar');
  await page.getByLabel('Email', { exact: true }).fill(actor.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(s.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('.account-identity')).toBeVisible();
}
async function add(page: Page, s: Seed, quantity = '250') {
  await navigate(page, '/produtos/' + s.body.produtoId);
  await page.getByLabel('Quantidade a adicionar').fill(quantity);
  await page
    .getByRole('button', {
      name: 'Adicionar ' + s.scenario.products[0]!.nome + ' ao carrinho',
      exact: true,
    })
    .click();
}
test('carrinhos reais A/B, logout, refresh e duas sessões no mesmo navegador ficam isolados', async ({
  page,
  context,
  request,
}) => {
  const s = await seed(request);
  await login(page, s);
  await add(page, s);
  await navigate(page, '/area/comprador');
  await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await navigate(page, '/carrinho');
  await expect(page.locator('.cart-line')).toHaveCount(0);
  await login(page, s, s.buyers[1]!);
  await navigate(page, '/carrinho');
  await expect(page.locator('.cart-line')).toHaveCount(0);
  await add(page, s, '500');
  const other = await context.newPage();
  await login(other, s);
  await navigate(other, '/carrinho');
  await expect(other.locator('.cart-line__subtotal')).toContainText('0,38');
  await navigate(page, '/carrinho');
  await expect(page.locator('.cart-line__subtotal')).toContainText('0,75');
  await page.reload();
  await expect(page.locator('.cart-line')).toHaveCount(0);
  await login(page, s, s.buyers[1]!);
  await navigate(page, '/carrinho');
  await expect(page.locator('.cart-line__subtotal')).toContainText('0,75');
  const a = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!).items,
    cartStorageKey(s.buyers[0]!.id),
  );
  const b = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!).items,
    cartStorageKey(s.buyers[1]!.id),
  );
  expect(a[0].quantity).toBe(250);
  expect(b[0].quantity).toBe(500);
  for (const width of [320, 430, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 940 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await expect(page.locator('.header-cart')).toContainText('1');
    await page.screenshot({
      path: test.info().outputPath('account-cart-' + width + '.png'),
      fullPage: true,
      animations: 'disabled',
    });
  }
});
async function won(page: Page, request: APIRequestContext) {
  const s = await seed(request);
  await login(page, s);
  const created = await request.post(api + '/auctions', {
    headers: { Authorization: 'Bearer ' + s.sellerToken, 'Idempotency-Key': randomUUID() },
    data: { ...s.body, terminaEm: new Date(Date.now() + 12000).toISOString() },
  });
  expect(created.status()).toBe(201);
  const a = await created.json();
  await navigate(page, '/leiloes/' + a.id);
  await expect(page.getByText('Ligado à sala', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar oferta', exact: true }).click();
  await expect(page.getByTestId('auction-lead')).toContainText('tua oferta está na liderança');
  await expect(page.getByRole('heading', { name: 'Parabéns! Ganhaste este leilão.' })).toBeVisible({
    timeout: 20000,
  });
  return { s, a };
}
test('Socket → vencedor → compra → encomenda do produtor → receção, sem alterar a cesta normal', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(60000);
  const { s, a } = await won(page, request);
  await add(page, s, '250');
  const before = await page.evaluate(
    (k) => localStorage.getItem(k),
    cartStorageKey(s.buyers[0]!.id),
  );
  await navigate(page, '/leiloes/' + a.id);
  await page.getByRole('link', { name: 'Finalizar compra', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Finalizar compra do leilão.' })).toBeVisible();
  await expect(page.getByText('Lote de leilão · 500 g', { exact: true })).toBeVisible();
  const name = s.scenario.producers[0]!.nomePublico;
  await page.getByLabel('Pagamento · ' + name, { exact: true }).selectOption('dinheiro');
  await page.getByLabel('Janela horária · ' + name, { exact: true }).selectOption('0');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirmar encomenda do leilão' }).click();
  await expect(page.getByRole('heading', { name: 'Encomenda criada.' })).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), cartStorageKey(s.buyers[0]!.id))).toBe(
    before,
  );
  const record = await db
    .db!.collection('orders')
    .findOne({ leilaoOrigem: new Types.ObjectId(a.id) });
  expect(record!.subtotalProdutosCent).toBe(30100);
  expect(record!.linhas[0].unidadeSnapshot.conteudoPorUnidade.quantidade).toBe(500);
  expect(
    (await db.db!.collection('products').findOne({ _id: s.scenario.products[0]!._id }))!
      .stockDisponivel,
  ).toBe(9500);
  const seller = await browser.newContext(),
    sellerPage = await seller.newPage();
  try {
    await login(sellerPage, s, s.seller);
    await navigate(sellerPage, '/area/produtor/leiloes/' + a.id);
    await expect(sellerPage.getByText('Encomenda criada.', { exact: true })).toBeVisible();
    await sellerPage.getByRole('link', { name: 'Consultar encomenda do leilão' }).click();
    await expect(sellerPage.getByText('Encomenda de leilão', { exact: true })).toBeVisible();
    for (const name of ['Confirmar encomenda', 'Iniciar preparação', 'Marcar como pronta'])
      await sellerPage.getByRole('button', { name, exact: true }).click();
    await page.getByRole('link', { name: 'Consultar encomenda do leilão' }).click();
    await expect(page.getByText('Encomenda de leilão', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Confirmar rece/ }).click();
    await page.getByRole('button', { name: 'Sim, recebi a encomenda', exact: true }).click();
    await expect
      .poll(async () => (await db.db!.collection('orders').findOne({ _id: record!._id }))!.estado)
      .toBe('concluida');
  } finally {
    await seller.close();
  }
});
test('resposta perdida depois do commit recupera a mesma encomenda, sem duplicar', async ({
  page,
  request,
}) => {
  test.setTimeout(45000);
  const { a } = await won(page, request);
  await page.getByRole('link', { name: 'Finalizar compra' }).click();
  await page.getByLabel(/^Pagamento ·/).selectOption('dinheiro');
  await page.getByLabel(/^Janela horária ·/).selectOption('0');
  await page.getByRole('checkbox').check();
  const calls: { key: string | undefined; body: unknown }[] = [];
  await page.route('**/api/auctions/' + a.id + '/checkout', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    calls.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON(),
    });
    const response = await route.fetch();
    if (calls.length === 1) {
      expect(response.status()).toBe(201);
      await route.abort('failed');
    } else {
      expect(response.status()).toBe(200);
      await route.fulfill({ response });
    }
  });
  await page.getByRole('button', { name: 'Confirmar encomenda do leilão' }).click();
  await expect(page.getByRole('alert')).toContainText('Resultado ainda desconhecido');
  await page.getByRole('button', { name: 'Recuperar compra do leilão' }).click();
  await expect(page.getByRole('heading', { name: 'Encomenda criada.' })).toBeVisible();
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(calls[0]);
  expect(
    await db.db!.collection('orders').countDocuments({ leilaoOrigem: new Types.ObjectId(a.id) }),
  ).toBe(1);
});
for (const width of [320, 430, 768, 1024, 1280, 1440]) {
  test(`compra real do lote e encomendas responsivas a ${width}px`, async ({
    page,
    request,
    browser,
  }, info) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width, height: 940 });
    const { s, a } = await won(page, request);
    await page.screenshot({
      path: info.outputPath('auction-winner-' + width + '.png'),
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('link', { name: 'Finalizar compra' }).click();
    await expect(page.getByRole('heading', { name: 'Finalizar compra do leilão.' })).toBeVisible();
    await expect(page.getByText('Lote de leilão · 500 g', { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await expect(
      page.getByRole('button', { name: 'Confirmar encomenda do leilão' }),
    ).toBeDisabled();
    await page
      .getByLabel('Pagamento · ' + s.scenario.producers[0]!.nomePublico, { exact: true })
      .selectOption('dinheiro');
    await page
      .getByLabel('Janela horária · ' + s.scenario.producers[0]!.nomePublico, { exact: true })
      .selectOption('0');
    await page.getByRole('checkbox').check();
    await page.screenshot({
      path: info.outputPath('auction-checkout-' + width + '.png'),
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Confirmar encomenda do leilão' }).click();
    await expect(page.getByRole('heading', { name: 'Encomenda criada.' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.getByRole('link', { name: 'Consultar encomenda do leilão' }).click();
    await expect(page.getByText('Encomenda de leilão', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath('auction-buyer-order-' + width + '.png'),
      fullPage: true,
      animations: 'disabled',
    });
    const seller = await browser.newContext({ viewport: { width, height: 940 } }),
      sellerPage = await seller.newPage();
    try {
      await login(sellerPage, s, s.seller);
      await navigate(sellerPage, '/area/produtor/leiloes/' + a.id);
      await expect(
        sellerPage.getByRole('link', { name: 'Consultar encomenda do leilão' }),
      ).toBeVisible();
      expect(
        await sellerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await sellerPage.getByRole('link', { name: 'Consultar encomenda do leilão' }).click();
      await expect(sellerPage.getByText('Encomenda de leilão', { exact: true })).toBeVisible();
      expect(
        await sellerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await sellerPage.screenshot({
        path: info.outputPath('auction-producer-order-' + width + '.png'),
        fullPage: true,
        animations: 'disabled',
      });
    } finally {
      await seller.close();
    }
  });
}
