import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection, Types } from 'mongoose';
import { receiptScenario } from '../../api/tests/support/order-receipt-fixtures';
import { createUserModel } from '../../api/src/modules/users/user.model';
import { hashPassword } from '../../api/src/modules/auth/passwords';
import { inspectOrderContrast } from './support/admin-order-accessibility';
const api = 'http://127.0.0.1:3011/api';
let root: ReturnType<typeof createConnection>, db: ReturnType<typeof createConnection>;
const cleanupUsers = new Set<string>();
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
test.afterAll(async () => {
  await root?.close();
});
test.afterEach(async () => {
  const ids = [...cleanupUsers].map((id) => new Types.ObjectId(id));
  cleanupUsers.clear();
  if (!ids.length) return;
  await db.db!.collection('reviews').deleteMany({ autor: { $in: ids } });
  await db.db!.collection('orders').deleteMany({ comprador: { $in: ids } });
  await db.db!.collection('products').deleteMany({ produtor: { $in: ids } });
  await db.db!.collection('producers').deleteMany({ userId: { $in: ids } });
  await db.db!.collection('users').deleteMany({ _id: { $in: ids } });
});
async function subject(page: Page, state: 'pendente' | 'pronta' = 'pronta') {
  const x = await receiptScenario(db, randomBytes(32), state),
    password = 'Frase fictícia ' + randomUUID(),
    User = createUserModel(db);
  cleanupUsers.add(x.s.buyerId.toHexString());
  cleanupUsers.add(x.s.producers[0]!.userId.toHexString());
  const buyer = await User.findById(x.s.buyerId).orFail(),
    producer = await User.findById(x.s.producers[0]!.userId).orFail();
  buyer.passwordHash = await hashPassword(password);
  producer.passwordHash = await hashPassword(password);
  await buyer.save();
  await producer.save();
  const admin = await User.create({
    nome: 'Admin fictício da receção',
    emailNormalizado: randomUUID() + '@example.invalid',
    passwordHash: await hashPassword(password),
    papeis: ['administrador'],
    ativo: true,
  });
  cleanupUsers.add(admin.id);
  const credentials = { email: buyer.emailNormalizado, password },
    producerCredentials = { email: producer.emailNormalizado, password },
    adminCredentials = { email: admin.emailNormalizado, password };
  const b = await page.request.post(api + '/auth/login', { data: credentials }),
    p = await page.request.post(api + '/auth/login', { data: producerCredentials });
  expect(b.status()).toBe(200);
  expect(p.status()).toBe(200);
  return {
    ...x,
    credentials,
    producerCredentials,
    adminCredentials,
    token: (await b.json()).accessToken as string,
    producerToken: (await p.json()).accessToken as string,
    path: '/area/comprador/encomendas/' + x.id,
    producerPath: '/area/produtor/encomendas/' + x.id,
  };
}
async function login(
  page: Page,
  credentials: { email: string; password: string },
  destination: string,
) {
  await page.goto('/entrar?destino=' + encodeURIComponent(destination));
  await page.getByLabel('Email', { exact: true }).fill(credentials.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(destination + '$'));
  if (/^\/area\/(comprador|produtor)(?:\/|$)/.test(destination))
    await expect(
      page.getByText('Atualizações em direto ligadas. Os dados são confirmados pela API.', {
        exact: true,
      }),
    ).toBeVisible();
}
async function navigate(page: Page, path: string) {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function confirm(page: Page) {
  await page.getByRole('button', { name: 'Confirmar receção', exact: true }).click();
  await page.getByRole('button', { name: 'Sim, recebi a encomenda', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Avaliar esta compra', exact: true })).toBeVisible();
}
async function producerState(page: Page, x: Awaited<ReturnType<typeof subject>>, estado: string) {
  const url = api + '/me/producer/orders/' + x.id,
    headers = { Authorization: 'Bearer ' + x.producerToken },
    r = await page.request.get(url, { headers });
  expect(r.status()).toBe(200);
  const result = await page.request.patch(url + '/status', {
    headers: { ...headers, 'If-Match': r.headers().etag! },
    data: { estado },
  });
  expect(result.status()).toBe(200);
}
async function capture(page: Page, name: string, scope = '.live-orders') {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    scrollTo({ top: 0, behavior: 'instant' });
    return new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const r of await page.locator(scope + ' button,' + scope + ' a').evaluateAll((els) =>
    els
      .filter((e) => e.getClientRects().length)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { left: r.left, right: r.right };
      }),
  )) {
    expect(r.left).toBeGreaterThanOrEqual(-1);
    expect(r.right).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
  const contrast = await inspectOrderContrast(page, scope),
    out = process.env.DOCAMPO_RECEIPT_SCREENSHOTS;
  if (out) {
    await mkdir(out, { recursive: true });
    await page.screenshot({
      path: join(out, name + '.png'),
      fullPage: !name.includes('-confirmacao'),
      animations: 'disabled',
    });
    await writeFile(join(out, name + '.yml'), await page.locator('body').ariaSnapshot());
    await writeFile(join(out, name + '-contrast.json'), JSON.stringify(contrast));
    const cdp = await page.context().newCDPSession(page);
    await writeFile(
      join(out, name + '-ax.json'),
      JSON.stringify(await cdp.send('Accessibility.getFullAXTree')),
    );
    await cdp.detach();
  }
}
test('compra real pendente → preparação REST → receção React → avaliação; dois intervenientes convergem em direto', async ({
  page,
  browser,
}) => {
  const x = await subject(page, 'pendente'),
    context = await browser.newContext(),
    producer = await context.newPage();
  try {
    await login(page, x.credentials, x.path);
    await login(producer, x.producerCredentials, x.producerPath);
    await expect(page.getByRole('button', { name: 'Confirmar receção', exact: true })).toHaveCount(
      0,
    );
    for (const estado of ['confirmada', 'em_preparacao', 'pronta'])
      await producerState(page, x, estado);
    await expect(
      page.getByRole('button', { name: 'Confirmar receção', exact: true }),
    ).toBeVisible();
    const before = await db.db!.collection('orders').findOne({ _id: new Types.ObjectId(x.id) });
    await confirm(page);
    await expect(producer.locator('.buyer-order-status')).toHaveText('Concluída');
    expect(
      await page.evaluate(() => [localStorage.getItem('token'), sessionStorage.getItem('token')]),
    ).toEqual([null, null]);
    const after = await db.db!.collection('orders').findOne({ _id: new Types.ObjectId(x.id) });
    expect(after!.pagamento).toEqual(before!.pagamento);
    await page.getByRole('link', { name: 'Avaliar esta compra', exact: true }).click();
    await page.getByRole('button', { name: 'Avaliar produto', exact: true }).click();
    await page.getByRole('radio', { name: '5 estrelas', exact: true }).check();
    await page
      .getByLabel('Comentário', { exact: true })
      .fill('Receção real de uma compra fictícia.');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Publicar avaliação', exact: true }).click();
    await expect(
      page.getByText('Avaliação publicada e confirmada pelo serviço.', { exact: true }),
    ).toBeVisible();
    expect(
      await db.db!.collection('reviews').countDocuments({ encomenda: new Types.ObjectId(x.id) }),
    ).toBe(1);
  } finally {
    await context.close();
  }
});
test('perda real da resposta após commit recupera por REST sem duplicar confirmação', async ({
  page,
}) => {
  const x = await subject(page);
  await login(page, x.credentials, x.path);
  let count = 0;
  await page.route('**/api/orders/*/receipt', async (route) => {
    count++;
    const r = await route.fetch();
    expect(r.status()).toBe(200);
    await route.abort('failed');
  });
  await confirm(page);
  expect(count).toBe(1);
  const raw = await db.db!.collection('orders').findOne({ _id: new Types.ObjectId(x.id) });
  expect(raw!.rececao.historico).toHaveLength(1);
  expect(raw!.versao).toBe(4);
});
test('falha de rede antes da escrita pede consulta e permite recuperar com o mesmo estado', async ({
  page,
}) => {
  const x = await subject(page);
  await login(page, x.credentials, x.path);
  await page.route('**/api/orders/*/receipt', (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'Confirmar receção', exact: true }).click();
  await page.getByRole('button', { name: 'Sim, recebi a encomenda', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Consulta a encomenda');
  expect(
    (await db.db!.collection('orders').findOne({ _id: new Types.ObjectId(x.id) }))!.estado,
  ).toBe('pronta');
  await page.unroute('**/api/orders/*/receipt');
  await page
    .getByRole('button', { name: 'Consultar estado antes de repetir', exact: true })
    .click();
  await confirm(page);
});
test('reconexão de transporte e reconciliação REST recuperam alteração ocorrida desligado', async ({
  page,
  context,
}) => {
  const x = await subject(page, 'pendente');
  await login(page, x.credentials, x.path);
  await context.setOffline(true);
  for (const estado of ['confirmada', 'em_preparacao', 'pronta'])
    await producerState(page, x, estado);
  await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Confirmar receção', exact: true })).toBeVisible();
});
test('duplo clique na confirmação efetua um único PATCH e preserva histórico único', async ({
  page,
}) => {
  const x = await subject(page);
  await login(page, x.credentials, x.path);
  let count = 0;
  page.on('request', (req) => {
    if (req.method() === 'PATCH' && req.url().endsWith('/receipt')) count++;
  });
  await page.getByRole('button', { name: 'Confirmar receção', exact: true }).click();
  await page.getByRole('button', { name: 'Sim, recebi a encomenda', exact: true }).dblclick();
  await expect(page.getByRole('link', { name: 'Avaliar esta compra', exact: true })).toBeVisible();
  expect(count).toBe(1);
  expect(
    (await db.db!.collection('orders').findOne({ _id: new Types.ObjectId(x.id) }))!.rececao
      .historico,
  ).toHaveLength(1);
});
for (const width of [320, 430, 768, 1024, 1280, 1440])
  test('ciclo completo, estados e acessibilidade a ' + width + ' px', async ({ page, browser }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    const x = await subject(page),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await login(page, x.credentials, x.path);
    await expect(
      page.getByRole('button', { name: 'Confirmar receção', exact: true }),
    ).toBeVisible();
    await capture(page, width + '-comprador-pronta');
    // Falha de apresentação injetada; a concorrência efetiva é testada separadamente com MongoDB real.
    await page.route('**/api/orders/*/receipt', (route) =>
      route.fulfill({ status: 412, json: { codigo: 'PRECONDICAO_FALHOU' } }),
    );
    await page.getByRole('button', { name: 'Confirmar receção', exact: true }).click();
    await page.getByRole('button', { name: 'Sim, recebi a encomenda', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('A encomenda mudou');
    await capture(page, width + '-conflito');
    await page.unroute('**/api/orders/*/receipt');
    await page
      .getByRole('button', { name: 'Consultar estado antes de repetir', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Confirmar receção', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Confirmar receção', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: 'Continuar análise', exact: true }),
    ).toBeFocused();
    await capture(page, width + '-confirmacao');
    await page.getByRole('button', { name: 'Sim, recebi a encomenda', exact: true }).click();
    await expect(
      page.getByRole('link', { name: 'Avaliar esta compra', exact: true }),
    ).toBeVisible();
    await expect(page.locator('h1')).toBeFocused();
    await capture(page, width + '-comprador-concluida');
    await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
    await login(page, x.producerCredentials, '/area/produtor');
    await expect(
      page.getByRole('heading', { name: 'Da tua terra, para outras mesas.', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.producer-metrics')).toContainText('Encomendas concluídas');
    await capture(page, width + '-produtor-indicadores', '.producer-live');
    await navigate(page, x.producerPath);
    await expect(page.locator('.buyer-order-status')).toHaveText('Concluída');
    await expect(page.getByRole('button', { name: 'Confirmar receção', exact: true })).toHaveCount(
      0,
    );
    await capture(page, width + '-produtor-concluida', '.producer-live');
    await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
    await login(page, x.adminCredentials, '/area/administrador/encomendas/' + x.id);
    await expect(page.locator('.buyer-order-status')).toHaveText('Concluída');
    await capture(page, width + '-administracao', '.admin-orders');
    const ctx: BrowserContext = await browser.newContext();
    try {
      const fresh = await ctx.newPage();
      await fresh.setViewportSize({ width, height: 900 });
      await login(fresh, x.credentials, x.path);
      await fresh.route('**/api/orders/*', (route) => route.abort('failed'));
      await fresh.getByRole('button', { name: 'Atualizar consulta', exact: true }).click();
      await expect(fresh.getByRole('alert')).toBeVisible();
      await capture(fresh, width + '-erro-rede');
      await fresh.unroute('**/api/orders/*');
      await fresh.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
      await expect(
        fresh.getByRole('link', { name: 'Avaliar esta compra', exact: true }),
      ).toBeVisible();
      await capture(fresh, width + '-recuperada');
    } finally {
      await ctx.close();
    }
    await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
    const emptyPassword = 'Fictícia vazia ' + randomUUID(),
      empty = await createUserModel(db).create({
        nome: 'Comprador sem compras',
        emailNormalizado: randomUUID() + '@example.invalid',
        passwordHash: await hashPassword(emptyPassword),
        papeis: ['comprador'],
        ativo: true,
      });
    cleanupUsers.add(empty.id);
    await login(
      page,
      { email: empty.emailNormalizado, password: emptyPassword },
      '/area/comprador/encomendas',
    );
    await expect(
      page.getByRole('heading', { name: 'Ainda não tens encomendas.', exact: true }),
    ).toBeVisible();
    await capture(page, width + '-vazio');
    expect(errors).toEqual([]);
  });
