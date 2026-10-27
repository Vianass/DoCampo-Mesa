import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'mongoose';
import { checkoutScenario, seedCheckoutScenario } from '../../api/tests/support/checkout-fixtures';
import { createUserModel } from '../../api/src/modules/users/user.model';
import { hashPassword } from '../../api/src/modules/auth/passwords';
const url = 'http://127.0.0.1:3011/api',
  base = '/me/producer/orders';
let connection: ReturnType<typeof createConnection>, database: ReturnType<typeof createConnection>;
const seeded: ReturnType<typeof checkoutScenario>[] = [];
test.beforeAll(async () => {
  connection = await createConnection(
    'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
    { dbName: 'admin' },
  ).asPromise();
  const names = (await connection.db!.admin().listDatabases()).databases.filter((d) =>
    d.name.startsWith('docampo_test_web_'),
  );
  expect(names).toHaveLength(1);
  database = connection.useDb(names[0]!.name);
});
test.afterEach(async () => {
  for (const s of seeded.splice(0)) {
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
async function subject(page: Page, count = 1) {
  const s = checkoutScenario(count);
  s.products.forEach((p, i) =>
    Object.assign(p, {
      nome: 'Colheita fictícia de gestão ' + (i + 1),
      imagens: [
        {
          url: 'http://127.0.0.1:5183/images/tomatoes.webp',
          alt: 'Ilustração fictícia',
          principal: true,
        },
      ],
    }),
  );
  await seedCheckoutScenario(database, s);
  seeded.push(s);
  const password = 'Frase fictícia de gestão ' + randomUUID(),
    User = createUserModel(database);
  const actors = [];
  for (const id of [s.buyerId, ...s.producers.map((p) => p.userId)]) {
    const user = await User.findById(id).select('+passwordHash').orFail();
    user.passwordHash = await hashPassword(password);
    await user.save();
    const login = await page.request.post(url + '/auth/login', {
      data: { email: user.emailNormalizado, password },
    });
    expect(login.status()).toBe(200);
    actors.push({
      email: user.emailNormalizado,
      password,
      token: (await login.json()).accessToken as string,
    });
  }
  const response = await page.request.post(url + '/orders', {
    headers: { Authorization: 'Bearer ' + actors[0]!.token, 'Idempotency-Key': s.chave },
    data: s.pedido,
  });
  expect(response.status()).toBe(201);
  const receipt = await response.json();
  const id = receipt.encomendas.find(
    (o: { produtorContaId: string }) => o.produtorContaId === s.producers[0]!.userId.toHexString(),
  ).orderId as string;
  return { ...s, actors, id };
}
async function login(
  page: Page,
  actor: { email: string; password: string },
  destination = '/area/produtor/encomendas',
) {
  await page.goto('/entrar?destino=' + encodeURIComponent(destination));
  await page.getByLabel('Email', { exact: true }).fill(actor.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(actor.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(destination + '$'));
}
async function detail(page: Page) {
  await page.getByRole('link', { name: 'Consultar encomenda →', exact: true }).click();
  await expect(page.locator('.live-order')).toHaveCount(1);
}
test('produção própria de compra multi-produtor e estado atualizado visível no React comprador', async ({
  page,
  browser,
}) => {
  const s = await subject(page, 2);
  await login(page, s.actors[1]!);
  await expect(page.locator('.producer-live-card')).toHaveCount(1);
  await expect(page.locator('.producer-live-card')).toContainText(s.id);
  await detail(page);
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5183' }),
    buyer = await context.newPage();
  try {
    await login(buyer, s.actors[0]!, '/area/comprador/encomendas/' + s.id);
    await expect(buyer.locator('.buyer-order-status')).toHaveText('Pendente');
    await page.getByRole('button', { name: 'Confirmar encomenda', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Estado atualizado para Confirmada' }),
    ).toBeVisible();
    await buyer.getByRole('button', { name: 'Atualizar consulta', exact: true }).click();
    await expect(buyer.locator('.buyer-order-status')).toHaveText('Confirmada');
    await expect(buyer.getByRole('heading', { name: 'Histórico', exact: true })).toBeVisible();
    expect(await database.db!.collection('orders').countDocuments({ comprador: s.buyerId })).toBe(
      2,
    );
  } finally {
    await context.close();
  }
});
test('transições reais preservam snapshots, recibo, pagamento e stock', async ({ page }) => {
  const s = await subject(page),
    orders = database.db!.collection('orders'),
    before = await orders.findOne({ produtor: s.producers[0]!.userId }),
    productBefore = await database.db!.collection('products').findOne({ _id: s.products[0]!._id });
  await login(page, s.actors[1]!);
  await detail(page);
  for (const label of ['Confirmar encomenda', 'Iniciar preparação', 'Marcar como pronta']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Estado atualizado para' }),
    ).toBeVisible();
  }
  const after = await orders.findOne({ _id: before!._id });
  expect(after!.estado).toBe('pronta');
  expect(after!.versao).toBe(3);
  for (const field of ['linhas', 'pagamento', 'entrega', 'idempotencia', 'totalCent'])
    expect(after![field]).toEqual(before![field]);
  expect(after!.historicoEstado).toHaveLength(4);
  expect(
    (await database.db!.collection('products').findOne({ _id: s.products[0]!._id }))!
      .stockDisponivel,
  ).toBe(productBefore!.stockDisponivel);
  await expect(
    page.getByText('Não há transições de estado disponíveis para o produtor nesta etapa.'),
  ).toBeVisible();
});
test('dois separadores reais não sobrescrevem a mesma versão', async ({ page, browser }) => {
  const s = await subject(page);
  await login(page, s.actors[1]!);
  await detail(page);
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5183' }),
    other = await context.newPage();
  try {
    await login(other, s.actors[1]!);
    await detail(other);
    await page.getByRole('button', { name: 'Confirmar encomenda', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Iniciar preparação', exact: true }),
    ).toBeVisible();
    await other.getByRole('button', { name: 'Confirmar encomenda', exact: true }).click();
    await expect(other.getByRole('alert')).toContainText('A encomenda mudou');
    await other.getByRole('button', { name: 'Atualizar consulta', exact: true }).click();
    await expect(
      other.getByRole('button', { name: 'Iniciar preparação', exact: true }),
    ).toBeEnabled();
    expect(
      (await database.db!.collection('orders').findOne({ produtor: s.producers[0]!.userId }))!
        .historicoEstado,
    ).toHaveLength(2);
  } finally {
    await context.close();
  }
});
test('perda da resposta de alteração exige releitura e não duplica o comando', async ({ page }) => {
  const s = await subject(page);
  await login(page, s.actors[1]!);
  await detail(page);
  await page.route('**/me/producer/orders/*/status', async (route) => {
    const r = await route.fetch();
    expect(r.status()).toBe(200);
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Confirmar encomenda', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível confirmar a alteração');
  await expect(
    page.getByRole('button', { name: 'Confirmar encomenda', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Atualizar consulta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Iniciar preparação', exact: true })).toBeVisible();
  const order = await database
    .db!.collection('orders')
    .findOne({ produtor: s.producers[0]!.userId });
  expect(order!.estado).toBe('confirmada');
  expect(order!.historicoEstado).toHaveLength(2);
});
test('produtor alheio recebe 404 e comprador não pode usar a API do produtor', async ({ page }) => {
  const s = await subject(page, 2);
  await login(page, s.actors[2]!, '/area/produtor/encomendas/' + s.id);
  await expect(page.getByRole('alert')).toContainText('Esta encomenda não está disponível');
  const response = await page.request.get(url + base, {
    headers: { Authorization: 'Bearer ' + s.actors[0]!.token },
  });
  expect(response.status()).toBe(403);
});
test('remoção real do papel bloqueia a alteração com o token existente', async ({ page }) => {
  const s = await subject(page);
  await login(page, s.actors[1]!);
  await detail(page);
  const user = await createUserModel(database)
    .findById(s.producers[0]!.userId)
    .select('+passwordHash')
    .orFail();
  user.papeis = ['comprador'];
  await user.save();
  await page.getByRole('button', { name: 'Confirmar encomenda', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(
    (await database.db!.collection('orders').findOne({ produtor: s.producers[0]!.userId }))!.estado,
  ).toBe('pendente');
});
for (const width of [320, 430, 768, 1024, 1280, 1440])
  test(`gestão real do produtor responsiva a ${width}px`, async ({ page }) => {
    const s = await subject(page),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await login(page, s.actors[1]!);
    await expect(page.locator('.producer-live-card')).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/private/tmp/docampo-5f-list-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await detail(page);
    await page.getByRole('button', { name: 'Confirmar encomenda', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: 'Iniciar preparação', exact: true }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: `/private/tmp/docampo-5f-detail-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });
