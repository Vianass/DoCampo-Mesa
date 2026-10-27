import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'mongoose';
import { checkoutScenario, seedCheckoutScenario } from '../../api/tests/support/checkout-fixtures';
import { createUserModel } from '../../api/src/modules/users/user.model';
import { hashPassword } from '../../api/src/modules/auth/passwords';
let connection: ReturnType<typeof createConnection>;
let database: ReturnType<typeof createConnection>;
const seeded: ReturnType<typeof checkoutScenario>[] = [];
test.beforeAll(async () => {
  connection = await createConnection(
    'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
    { dbName: 'admin' },
  ).asPromise();
  const names = (await connection.db!.admin().listDatabases()).databases
    .map((d) => d.name)
    .filter((n) => n.startsWith('docampo_test_web_'));
  expect(names).toHaveLength(1);
  database = connection.useDb(names[0]!);
});
test.afterEach(async () => {
  for (const s of seeded.splice(0)) {
    await database.db!.collection('checkout_attempts').deleteMany({ comprador: s.buyerId });
    await database.db!.collection('orders').deleteMany({ comprador: s.buyerId });
    await database
      .db!.collection('products')
      .deleteMany({ _id: { $in: s.products.map((p) => p._id) } });
    await database
      .db!.collection('producers')
      .deleteMany({ _id: { $in: s.producers.map((p) => p._id) } });
    await database
      .db!.collection('users')
      .deleteMany({ _id: { $in: [s.buyerId, ...s.producers.map((p) => p.userId)] } });
  }
});
test.afterAll(async () => {
  await connection?.close();
});
async function scenario(count = 1) {
  const s = checkoutScenario(count);
  s.products.forEach((p, i) => {
    Object.assign(p, {
      nome: 'Produto real fictício ' + (i + 1),
      imagens: [
        {
          url: 'http://127.0.0.1:5183/images/tomatoes.webp',
          alt: 'Fotografia ilustrativa',
          principal: true,
        },
      ],
    });
  });
  s.producers.forEach((p, i) => {
    Object.assign(p, { nomePublico: 'Origem fictícia ' + (i + 1) });
  });
  await seedCheckoutScenario(database, s);
  seeded.push(s);
  const password = 'Frase fictícia de compra ' + randomUUID();
  const user = await createUserModel(database).findById(s.buyerId).select('+passwordHash').orFail();
  user.passwordHash = await hashPassword(password);
  await user.save();
  return { ...s, password, email: s.buyerId.toHexString() + '@example.invalid' };
}
async function add(page: Page, s: Awaited<ReturnType<typeof scenario>>) {
  for (const p of s.products) {
    await page.goto('/produtos/' + p._id.toHexString());
    await page
      .getByRole('button', { name: 'Adicionar ' + p.nome + ' ao carrinho', exact: true })
      .click();
  }
}
async function login(page: Page, s: Awaited<ReturnType<typeof scenario>>) {
  await page.goto('/entrar?destino=%2Fcheckout');
  await page.getByLabel('Email', { exact: true }).fill(s.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(s.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/checkout$/);
}
async function choose(page: Page, count = 1, delivery = false) {
  for (let i = 1; i <= count; i++) {
    const name = 'Origem fictícia ' + i;
    if (delivery) {
      await page.getByLabel('Como receber · ' + name, { exact: true }).selectOption('entrega');
      await page
        .getByLabel('Concelho de entrega · ' + name, { exact: true })
        .selectOption('concelho-ficticio-001');
      await page
        .getByLabel('Contacto de entrega · ' + name, { exact: true })
        .fill('Contacto fictício da entrega');
      await page
        .getByLabel('Morada de entrega · ' + name, { exact: true })
        .fill('Morada fictícia apenas no servidor');
    }
    await page.getByLabel('Pagamento · ' + name, { exact: true }).selectOption('dinheiro');
    await page.getByLabel('Janela horária · ' + name, { exact: true }).selectOption('0');
  }
  await page
    .getByRole('checkbox', {
      name: 'Confirmo as quantidades, os preços e as condições apresentadas.',
    })
    .check();
}
test('checkout real de um produtor cria encomenda e limpa apenas a cesta confirmada', async ({
  page,
}) => {
  const s = await scenario();
  await add(page, s);
  await login(page, s);
  await choose(page);
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A tua compra está confirmada.' })).toBeVisible();
  await expect(page.locator('.live-order')).toHaveCount(1);
  const orders = await database.db!.collection('orders').find({ comprador: s.buyerId }).toArray();
  expect(orders).toHaveLength(1);
  expect(orders[0]!.totalCent).toBe(38);
  const product = await database.db!.collection('products').findOne({ _id: s.products[0]!._id });
  expect(product!.stockDisponivel).toBe(9750);
  const cart = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('docampo.cart.v1') ?? '{}'),
  );
  expect(cart.items).toEqual([]);
  await page.getByRole('link', { name: 'Consultar as minhas encomendas', exact: true }).click();
  await expect(page.locator('.live-order-card')).toHaveCount(1);
  await page.getByRole('link', { name: 'Consultar encomenda →', exact: true }).click();
  await expect(page.locator('.live-order')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Histórico', exact: true })).toBeVisible();
});
test('checkout real multi-produtor respeita entrega, taxas e dados privados', async ({ page }) => {
  const s = await scenario(2);
  await add(page, s);
  await login(page, s);
  await choose(page, 2, true);
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A tua compra está confirmada.' })).toBeVisible();
  await expect(page.locator('.live-order')).toHaveCount(2);
  const orders = await database.db!.collection('orders').find({ comprador: s.buyerId }).toArray();
  expect(orders).toHaveLength(2);
  expect(new Set(orders.map((o) => o.operacaoCompraId)).size).toBe(1);
  expect(orders.map((o) => o.totalCent)).toEqual([288, 288]);
  const storage = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]),
  );
  expect(storage.includes('Morada fictícia apenas no servidor')).toBe(false);
  expect(storage.includes('Contacto fictício da entrega')).toBe(false);
  expect(storage.includes(s.password)).toBe(false);
});
test('resposta HTTP perdida é recuperada depois de reload e novo login sem duplicar encomendas', async ({
  page,
}) => {
  const s = await scenario();
  await add(page, s);
  await login(page, s);
  await choose(page, 1, true);
  const keys: string[] = [];
  await page.route(
    (url) => url.pathname === '/api/orders',
    async (route) => {
      keys.push(route.request().headers()['idempotency-key']!);
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort('failed');
    },
  );
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(
    page.getByText('Ainda não foi possível confirmar o resultado.', { exact: false }),
  ).toBeVisible();
  expect(await database.db!.collection('orders').countDocuments({ comprador: s.buyerId })).toBe(1);
  expect(
    (await page.evaluate(() => JSON.parse(localStorage.getItem('docampo.cart.v1') ?? '{}'))).items,
  ).toHaveLength(1);
  await page.unrouteAll();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Entra para continuar a compra.' })).toBeVisible();
  await login(page, s);
  await page.route(
    (url) => url.pathname === '/api/orders',
    async (route) => {
      keys.push(route.request().headers()['idempotency-key']!);
      await route.continue();
    },
  );
  await page.getByRole('button', { name: 'Recuperar resultado da compra', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A tua compra está confirmada.' })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(await database.db!.collection('orders').countDocuments({ comprador: s.buyerId })).toBe(1);
  expect(
    (await database.db!.collection('products').findOne({ _id: s.products[0]!._id }))!
      .stockDisponivel,
  ).toBe(9750);
});

test('visitante preserva a cesta e retoma o checkout depois de iniciar sessão', async ({
  page,
}) => {
  const s = await scenario();
  await add(page, s);
  await page.locator('.header-cart').click();
  await page.getByRole('link', { name: 'Continuar para checkout', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Entra para continuar a compra.' })).toBeVisible();
  await page.getByRole('link', { name: 'Iniciar sessão', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(s.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(s.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Confirmar compra' })).toBeVisible();
  expect(
    (await page.evaluate(() => JSON.parse(localStorage.getItem('docampo.cart.v1') ?? '{}'))).items,
  ).toHaveLength(1);
});

test('alteração comercial exige nova revisão explícita e uma chave diferente', async ({ page }) => {
  const s = await scenario();
  await add(page, s);
  await login(page, s);
  await choose(page);
  const product = await database.db!.collection('products').findOne({ _id: s.products[0]!._id });
  const { createProductModel } = await import('../../api/src/modules/products/product.model');
  const model = await createProductModel(database).findById(product!._id).orFail();
  model.precoCent = 200;
  await model.save();
  const keys: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/orders' && r.method() === 'POST')
      keys.push(r.headers()['idempotency-key']!);
  });
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rever condições', exact: true })).toBeVisible();
  expect(await database.db!.collection('orders').countDocuments({ comprador: s.buyerId })).toBe(0);
  await page.getByRole('button', { name: 'Rever condições', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Confirmar compra' })).toBeVisible();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Confirmar compra', exact: true })).toBeDisabled();
  await choose(page);
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A tua compra está confirmada.' })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).not.toBe(keys[1]);
  const orders = await database.db!.collection('orders').find({ comprador: s.buyerId }).toArray();
  expect(orders).toHaveLength(1);
  expect(orders[0]!.totalCent).toBe(50);
});

test('stock esgotado antes de confirmar não apaga a cesta, inclusive depois de reload', async ({
  page,
}) => {
  const s = await scenario();
  await add(page, s);
  await login(page, s);
  await choose(page);
  const { createProductModel } = await import('../../api/src/modules/products/product.model');
  const model = await createProductModel(database).findById(s.products[0]!._id).orFail();
  model.stockDisponivel = 0;
  await model.save();
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rever condições', exact: true })).toBeVisible();
  expect(await database.db!.collection('orders').countDocuments({ comprador: s.buyerId })).toBe(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Entra para continuar a compra.' })).toBeVisible();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => JSON.parse(localStorage.getItem('docampo.cart.v1') ?? '{}')))
          .items.length,
    )
    .toBe(1);
  await login(page, s);
  await page.getByRole('button', { name: 'Recuperar resultado da compra', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rever condições', exact: true })).toBeVisible();
  expect(
    (await page.evaluate(() => JSON.parse(localStorage.getItem('docampo.cart.v1') ?? '{}'))).items,
  ).toHaveLength(1);
});

test('alterações posteriores da cesta sobrevivem à recuperação de uma compra já confirmada', async ({
  page,
}) => {
  const s = await scenario(2);
  await add(page, { ...s, products: s.products.slice(0, 1) });
  await login(page, s);
  await choose(page);
  let release!: () => void, committed!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    saved = new Promise<void>((r) => (committed = r));
  await page.route(
    (url) => url.pathname === '/api/orders',
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      committed();
      await gate;
      try {
        await route.fulfill({ response });
      } catch {
        /* O browser abandonou o pedido: recuperar pelo checkpoint. */
      }
    },
  );
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await saved;
  await page.locator('.header-cart').click();
  const quantity = page.getByLabel('Quantidade de ' + s.products[0]!.nome, { exact: true });
  await quantity.fill('500');
  await quantity.press('Tab');
  await expect(quantity).toHaveValue('500');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  release();
  await add(page, { ...s, products: s.products.slice(1) });
  await login(page, s);
  await page.getByRole('button', { name: 'Recuperar resultado da compra', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A tua compra está confirmada.' })).toBeVisible();
  const cart = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('docampo.cart.v1') ?? '{}'),
  );
  expect(cart.items).toHaveLength(2);
  expect(
    cart.items.find((i: { productId: string }) => i.productId === s.products[0]!._id.toHexString())
      .quantity,
  ).toBe(500);
  expect(await database.db!.collection('orders').countDocuments({ comprador: s.buyerId })).toBe(1);
});

test('encomenda alheia não é apresentada na área real do comprador', async ({ page, request }) => {
  const s = await scenario(),
    other = await scenario();
  const auth = await request.post('http://127.0.0.1:3011/api/auth/login', {
    data: { email: other.email, password: other.password },
  });
  expect(auth.status()).toBe(200);
  const token = (await auth.json()).accessToken;
  const result = await request.post('http://127.0.0.1:3011/api/orders', {
    headers: { Authorization: 'Bearer ' + token, 'Idempotency-Key': other.chave },
    data: other.pedido,
  });
  expect(result.status()).toBe(201);
  const id = (await result.json()).encomendas[0].orderId;
  await add(page, s);
  await login(page, s);
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, '/area/comprador/encomendas/' + id);
  await expect(page.getByRole('alert')).toContainText(
    'Esta encomenda não está disponível na tua conta.',
  );
  await expect(page.locator('.live-order')).toHaveCount(0);
});

test('sessão expirada no checkout preserva a cesta e exige novo login', async ({ page }) => {
  await page.clock.install();
  const s = await scenario();
  await add(page, s);
  await login(page, s);
  await expect(page.getByRole('form', { name: 'Confirmar compra' })).toBeVisible();
  await page.clock.fastForward(65000);
  await expect(page.getByRole('heading', { name: 'Entra para continuar a compra.' })).toBeVisible();
  expect(
    (await page.evaluate(() => JSON.parse(localStorage.getItem('docampo.cart.v1') ?? '{}'))).items,
  ).toHaveLength(1);
  expect(await database.db!.collection('orders').countDocuments({ comprador: s.buyerId })).toBe(0);
});

test('formulário real identifica dados obrigatórios sem enviar uma encomenda', async ({ page }) => {
  const s = await scenario();
  await add(page, s);
  await login(page, s);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Preenche o método de pagamento');
  expect(await database.db!.collection('orders').countDocuments({ comprador: s.buyerId })).toBe(0);
});

for (const width of [320, 430, 768, 1024, 1280, 1440])
  test(`checkout, confirmação e encomendas reais sem overflow a ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    const s = await scenario();
    await add(page, s);
    await login(page, s);
    await choose(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await expect(page.getByRole('button', { name: 'Confirmar compra', exact: true })).toBeEnabled();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: `/private/tmp/docampo-5e-checkout-${width}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
    await expect(page.locator('.live-order')).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: `/private/tmp/docampo-5e-confirmation-${width}.png`,
      fullPage: true,
    });
    await page.getByRole('link', { name: 'Consultar as minhas encomendas', exact: true }).click();
    await expect(page.locator('.live-order-card')).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `/private/tmp/docampo-5e-orders-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
