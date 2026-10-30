import { inspectOrderContrast } from './support/admin-order-accessibility';
import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection, Types } from 'mongoose';
import { checkoutScenario, seedCheckoutScenario } from '../../api/tests/support/checkout-fixtures';
import { createUserModel } from '../../api/src/modules/users/user.model';
import { hashPassword } from '../../api/src/modules/auth/passwords';
const api = 'http://127.0.0.1:3011/api',
  path = '/area/administrador/encomendas';
let connection: ReturnType<typeof createConnection>, database: ReturnType<typeof createConnection>;
const seeded: ReturnType<typeof checkoutScenario>[] = [];
const admins: Types.ObjectId[] = [];
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
  await database.db!.collection('users').deleteMany({ _id: { $in: admins.splice(0) } });
});
test.afterAll(async () => {
  await connection?.close();
});
async function subject(page: Page, count = 2) {
  const s = checkoutScenario(count);
  await seedCheckoutScenario(database, s);
  seeded.push(s);
  const credentials = {
    nome: 'Admin fictício 8B',
    email: randomUUID() + '@example.invalid',
    password: 'Revisão fictícia 8B ' + randomUUID(),
  };
  expect((await page.request.post(api + '/auth/register', { data: credentials })).status()).toBe(
    202,
  );
  const User = createUserModel(database),
    a = await User.findOne({ emailNormalizado: credentials.email }).orFail();
  a.papeis = ['administrador'];
  await a.save();
  admins.push(a._id);
  const identities = [];
  for (const id of [s.buyerId, ...s.producers.map((p) => p.userId)]) {
    const user = await User.findById(id).select('+passwordHash').orFail();
    user.passwordHash = await hashPassword(credentials.password);
    await user.save();
    const login = await page.request.post(api + '/auth/login', {
      data: { email: user.emailNormalizado, password: credentials.password },
    });
    expect(login.status()).toBe(200);
    identities.push({
      email: user.emailNormalizado,
      token: (await login.json()).accessToken as string,
    });
  }
  // Cada compra respeita o limite comercial de dez produtores.
  // A paginação global é exercitada com compras distintas, sem inventar encomendas.
  const receipt: { encomendas: { orderId: string; produtorContaId: string }[] } = {
    encomendas: [],
  };
  for (let offset = 0; offset < count; offset += 10) {
    const response = await page.request.post(api + '/orders', {
      headers: {
        Authorization: 'Bearer ' + identities[0]!.token,
        'Idempotency-Key': s.chave + '-' + offset,
      },
      data: {
        linhas: s.pedido.linhas.slice(offset, offset + 10),
        condicoesPorProdutor: s.pedido.condicoesPorProdutor.slice(offset, offset + 10),
      },
    });
    expect(response.status()).toBe(201);
    receipt.encomendas.push(...(await response.json()).encomendas);
  }
  const adminLogin = await page.request.post(api + '/auth/login', {
    data: { email: credentials.email, password: credentials.password },
  });
  expect(adminLogin.status()).toBe(200);
  return {
    ...s,
    credentials,
    identities,
    receipt,
    token: (await adminLogin.json()).accessToken as string,
  };
}
async function login(page: Page, credentials: { email: string; password: string }) {
  await page.goto('/entrar?destino=' + encodeURIComponent(path));
  await page.getByLabel('Email', { exact: true }).fill(credentials.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(path + '$'));
  await page.locator('.admin-order-card').first().waitFor();
}
async function inspect(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const rect of await page
    .locator('.admin-orders input,.admin-orders select,.admin-orders button,.admin-orders .button')
    .evaluateAll((els) =>
      els
        .filter((e) => e.getClientRects().length)
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { left: r.left, right: r.right, height: r.height };
        }),
    )) {
    expect(rect.left).toBeGreaterThanOrEqual(-1);
    expect(rect.right).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    expect(rect.height).toBeGreaterThanOrEqual(44);
  }
  const contrast = await inspectOrderContrast(page);
  const out = process.env.DOCAMPO_ADMIN_ORDER_SCREENSHOTS;
  if (out) {
    await mkdir(out, { recursive: true });
    await writeFile(join(out, name + '-contrast.json'), JSON.stringify(contrast));
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: join(out, name + '.png'),
      fullPage: true,
      animations: 'disabled',
    });
    await writeFile(join(out, name + '.yml'), await page.locator('body').ariaSnapshot());
    const cdp = await page.context().newCDPSession(page);
    await writeFile(
      join(out, name + '-ax.json'),
      JSON.stringify(await cdp.send('Accessibility.getFullAXTree')),
    );
    await cdp.detach();
  }
}
test('supervisão real vê compra multi-produtor, snapshots e transição operacional sem ganhar comandos', async ({
  page,
}) => {
  const s = await subject(page);
  await login(page, s.credentials);
  await expect(page.locator('.admin-order-card')).toHaveCount(2);
  const order = s.receipt.encomendas[0]!,
    id = order.orderId;
  const out = process.env.DOCAMPO_ADMIN_ORDER_SCREENSHOTS;
  if (out) {
    await mkdir(out, { recursive: true });
    for (const [name, url] of [
      ['AdminOrderPage8B', '/admin/orders'],
      ['AdminOrderDetail8B', '/admin/orders/' + id],
      ['AdminOrderHistoryPage8B', '/admin/orders/' + id + '/history'],
      ['AdminOrderPaymentHistory8B', '/admin/orders/' + id + '/history?dominio=pagamento'],
    ]) {
      const response = await page.request.get(api + url, {
        headers: { Authorization: 'Bearer ' + s.token },
      });
      expect(response.status()).toBe(200);
      await writeFile(join(out, name + '.json'), JSON.stringify(await response.json()));
    }
  }
  const before = await database.db!.collection('orders').find().sort({ _id: 1 }).toArray();
  const stock = await database.db!.collection('products').find().sort({ _id: 1 }).toArray();
  await page.getByLabel('Identificador exato da encomenda', { exact: true }).fill(id);
  await page.getByRole('button', { name: 'Pesquisar encomendas', exact: true }).click();
  await expect(page.locator('.admin-order-card')).toHaveCount(1);
  await database
    .db!.collection('products')
    .updateOne(
      { _id: s.products[0]!._id },
      { $set: { nome: 'Nome atual diferente', precoReferenciaCent: 99999 } },
    );
  await page.getByRole('link', { name: /Consultar encomenda/ }).click();
  await expect(page.locator('.live-order-lines')).toContainText('Produto para teste de checkout');
  await expect(page.locator('.live-order-lines')).not.toContainText('Nome atual diferente');
  const producer = s.identities[1]!,
    headers = { Authorization: 'Bearer ' + producer.token };
  const detail = await page.request.get(api + '/me/producer/orders/' + id, { headers });
  expect(detail.status()).toBe(200);
  expect(
    (
      await page.request.patch(api + '/me/producer/orders/' + id + '/status', {
        headers: { ...headers, 'If-Match': detail.headers().etag! },
        data: { estado: 'confirmada' },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'Atualizar detalhe', exact: true }).click();
  await expect(page.locator('.buyer-order-status')).toHaveText('Confirmada');
  await page.getByRole('button', { name: 'Atualizar histórico', exact: true }).click();
  await expect(page.locator('.admin-order-history')).toContainText('pendente', {
    ignoreCase: true,
  });
  await expect(page.locator('.admin-order-history')).toContainText(producer.email.split('@')[0]!);
  await expect(
    page.getByRole('button', { name: /Confirmar encomenda|Iniciar preparação|Cancelar encomenda/ }),
  ).toHaveCount(0);
  await page.getByLabel('Tipo de histórico', { exact: true }).selectOption('pagamento');
  await expect(page.locator('.admin-order-history')).toContainText('Por pagar');
  expect(
    (await database.db!.collection('orders').find().sort({ _id: 1 }).toArray()).map(
      (o) => o.totalCent,
    ),
  ).toEqual(before.map((o) => o.totalCent));
  expect(
    (await database.db!.collection('products').find().sort({ _id: 1 }).toArray()).map(
      (p) => p.stockDisponivel,
    ),
  ).toEqual(stock.map((p) => p.stockDisponivel));
});
test('paginação, filtros combinados, datas UTC e acesso direto usam API e MongoDB reais', async ({
  page,
}) => {
  const s = await subject(page, 13),
    headers = { Authorization: 'Bearer ' + s.token },
    id = s.receipt.encomendas[0]!.orderId;
  const q = new URLSearchParams({
    estado: 'pendente',
    pagamento: 'por_pagar',
    comprador: s.buyerId.toHexString(),
    produtor: s.producers[0]!.userId.toHexString(),
    identificador: id,
  });
  const r = await page.request.get(api + '/admin/orders?' + q, { headers });
  expect(r.status()).toBe(200);
  expect((await r.json()).total).toBe(1);
  expect((await page.request.get(api + '/admin/orders?pagina=1000', { headers })).status()).toBe(
    200,
  );
  for (const actor of s.identities)
    expect(
      (
        await page.request.get(api + '/admin/orders', {
          headers: { Authorization: 'Bearer ' + actor.token },
        })
      ).status(),
    ).toBe(403);
  expect((await page.request.get(api + '/admin/orders')).status()).toBe(401);
  await login(page, s.credentials);
  await expect(page.locator('.admin-order-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Página seguinte', exact: true }).click();
  await expect(page.locator('.admin-order-card')).toHaveCount(1);
  await page.getByLabel('Criadas desde (UTC)', { exact: true }).fill('2099-01-01');
  await page.getByRole('button', { name: 'Pesquisar encomendas', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Nenhuma encomenda corresponde à consulta.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(page.locator('.admin-order-card')).toHaveCount(12);
});
for (const width of [320, 430, 768, 1024, 1280, 1440])
  test('revisão real acessível sem overflow a ' + width + ' px', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const s = await subject(page, 1);
    await page.setViewportSize({ width, height: 900 });
    await login(page, s.credentials);
    await inspect(page, width + '-listagem');
    const field = page.getByLabel('Identificador exato da encomenda', { exact: true });
    await field.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('ID da conta do produtor', { exact: true })).toBeFocused();
    const focused = await page
      .getByLabel('ID da conta do produtor', { exact: true })
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          visible: el.matches(':focus-visible'),
          outline: s.outlineStyle,
          shadow: s.boxShadow,
        };
      });
    expect(focused.visible).toBe(true);
    expect(focused.outline !== 'none' || focused.shadow !== 'none').toBe(true);

    for (const input of await page.locator('.admin-order-filters input,.admin-orders select').all())
      await expect(input).toHaveAccessibleName(/.+/);
    const detailLink = page.getByRole('link', { name: /Consultar encomenda/ });
    await detailLink.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Histórico persistido' })).toBeVisible();
    await inspect(page, width + '-detalhe');
    await page.getByLabel('Tipo de histórico', { exact: true }).selectOption('pagamento');
    await expect(page.locator('.admin-order-history')).toContainText('Por pagar');
    await inspect(page, width + '-pagamento');
    // A falha é injetada no transporte; os dados recuperados continuam a vir da API real.
    await page.route('**/api/admin/orders/*', (route) => route.abort('failed'));
    await page.getByRole('button', { name: 'Atualizar detalhe', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(
      page.getByRole('group', { name: 'Recuperar consulta administrativa' }),
    ).toBeFocused();
    await inspect(page, width + '-erro');
    await page.unroute('**/api/admin/orders/*');
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(page.locator('.live-order')).toHaveCount(1);
    await inspect(page, width + '-recuperado');
    await page.getByRole('link', { name: '← Voltar às encomendas', exact: true }).click();
    await page.getByLabel('Criadas desde (UTC)', { exact: true }).fill('2099-01-01');
    await page.getByRole('button', { name: 'Pesquisar encomendas', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Nenhuma encomenda corresponde à consulta.' }),
    ).toBeVisible();
    await inspect(page, width + '-vazio');
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(() =>
        [...Object.values(localStorage), ...Object.values(sessionStorage)].some(
          (v) => v.includes('Bearer ') || /eyJ[A-Za-z0-9_-]+\./.test(v),
        ),
      ),
    ).toBe(false);
  });
