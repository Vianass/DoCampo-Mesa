import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection, Types } from 'mongoose';
import { seedAuctionActors, auctionInput } from '../../api/tests/support/auction-fixtures';
import { createUserModel } from '../../api/src/modules/users/user.model';
import { createProductModel } from '../../api/src/modules/products/product.model';
import { hashPassword } from '../../api/src/modules/auth/passwords';
import { inspectOrderContrast } from './support/admin-order-accessibility';
const api = 'http://127.0.0.1:3011/api',
  path = '/area/administrador/leiloes';
let connection: ReturnType<typeof createConnection>, db: ReturnType<typeof createConnection>;
const subjects: Awaited<ReturnType<typeof seedAuctionActors>>[] = [],
  adminIds: Types.ObjectId[] = [];
test.beforeAll(async () => {
  connection = await createConnection(
    'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
    { dbName: 'admin' },
  ).asPromise();
  const names = (await connection.db!.admin().listDatabases()).databases.filter((d) =>
    d.name.startsWith('docampo_test_web_'),
  );
  expect(names).toHaveLength(1);
  db = connection.useDb(names[0]!.name);
});
test.afterEach(async () => {
  for (const s of subjects.splice(0)) {
    const auctions = await db
      .db!.collection('auctions')
      .find({ produtor: new Types.ObjectId(s.seller.id) }, { projection: { _id: 1 } })
      .toArray();
    await db.db!.collection('bids').deleteMany({ leilao: { $in: auctions.map((a) => a._id) } });
    await db.db!.collection('auctions').deleteMany({ _id: { $in: auctions.map((a) => a._id) } });
    await db
      .db!.collection('products')
      .deleteMany({ _id: { $in: s.scenario.products.map((p) => p._id) } });
    await db
      .db!.collection('producers')
      .deleteMany({ _id: { $in: s.scenario.producers.map((p) => p._id) } });
    await db.db!.collection('users').deleteMany({
      _id: {
        $in: [new Types.ObjectId(s.seller.id), ...s.buyers.map((b) => new Types.ObjectId(b.id))],
      },
    });
  }
  await db.db!.collection('users').deleteMany({ _id: { $in: adminIds.splice(0) } });
});
test.afterAll(async () => {
  await connection?.close();
});
async function subject(page: Page, count = 1, ttl = 120000) {
  const s = await seedAuctionActors(db);
  subjects.push(s);
  const product = await createProductModel(db).findById(s.body.produtoId).orFail();
  product.nome = 'Tomates da revisão administrativa';
  product.imagens = [
    {
      url: 'http://127.0.0.1:5183/images/tomatoes.webp',
      alt: 'Fotografia ilustrativa da revisão',
      principal: true,
    },
  ];
  await product.save();
  const credentials = {
    nome: 'Admin fictício 8C',
    email: randomUUID() + '@example.invalid',
    password: 'Frase fictícia 8C ' + randomUUID(),
  };
  expect((await page.request.post(api + '/auth/register', { data: credentials })).status()).toBe(
    202,
  );
  const User = createUserModel(db),
    admin = await User.findOne({ emailNormalizado: credentials.email }).orFail();
  admin.papeis = ['administrador'];
  await admin.save();
  adminIds.push(admin._id);
  const actors = [];
  for (const principal of [s.seller, ...s.buyers]) {
    const user = await User.findById(principal.id).select('+passwordHash').orFail();
    user.passwordHash = await hashPassword(credentials.password);
    await user.save();
    const login = await page.request.post(api + '/auth/login', {
      data: { email: user.emailNormalizado, password: credentials.password },
    });
    expect(login.status()).toBe(200);
    actors.push({
      email: user.emailNormalizado,
      token: (await login.json()).accessToken as string,
    });
  }
  const auctions = [];
  for (let i = 0; i < count; i++) {
    const r = await page.request.post(api + '/auctions', {
      headers: { Authorization: 'Bearer ' + actors[0]!.token, 'Idempotency-Key': randomUUID() },
      data: {
        ...auctionInput(s.body.produtoId),
        titulo: 'Colheita real de supervisão ' + (i + 1),
        terminaEm: new Date(Date.now() + ttl).toISOString(),
      },
    });
    expect(r.status()).toBe(201);
    auctions.push({ body: await r.json(), etag: r.headers().etag! });
  }
  const login = await page.request.post(api + '/auth/login', {
    data: { email: credentials.email, password: credentials.password },
  });
  expect(login.status()).toBe(200);
  return {
    ...s,
    credentials,
    actors,
    auctions,
    adminToken: (await login.json()).accessToken as string,
    adminId: admin._id,
  };
}
async function login(
  page: Page,
  credentials: { email: string; password: string },
  destination = path,
) {
  await page.goto('/entrar?destino=' + encodeURIComponent(destination));
  await page.getByLabel('Email', { exact: true }).fill(credentials.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(destination + '$'));
}
async function bid(request: Page['request'], id: string, token: string, amount = 30100) {
  return request.post(api + '/auctions/' + id + '/bids', {
    headers: { Authorization: 'Bearer ' + token, 'Idempotency-Key': randomUUID() },
    data: { valorCent: amount },
  });
}
async function inspect(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const rect of await page
    .locator(
      '.admin-auctions input,.admin-auctions select,.admin-auctions button,.admin-auctions .market-button',
    )
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
  const contrast = await inspectOrderContrast(page, '.admin-auctions'),
    out = process.env.DOCAMPO_ADMIN_AUCTION_SCREENSHOTS;
  if (out) {
    await mkdir(out, { recursive: true });
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: join(out, name + '.png'),
      fullPage: true,
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
test('listagem global recebe invalidação real e relê ofertas MongoDB sem subscrever salas públicas', async ({
  page,
  request,
}) => {
  const s = await subject(page),
    id = s.auctions[0]!.body.id;
  await login(page, s.credentials);
  await expect(page.locator('.admin-auction-card')).toHaveCount(1);
  await expect(page.getByRole('status').filter({ hasText: 'Ligação ativa' })).toBeVisible();
  const reread = page.waitForResponse(
    (r) => r.url().includes('/api/admin/auctions?') && r.status() === 200,
  );
  expect((await bid(request, id, s.actors[1]!.token)).status()).toBe(201);
  await reread;
  await expect(page.locator('.admin-auction-card')).toContainText('301,00');
  await expect(page.locator('.admin-real-metrics')).toContainText('Licitações confirmadas');
  expect(await db.db!.collection('bids').countDocuments({ leilao: new Types.ObjectId(id) })).toBe(
    1,
  );
});
test('detalhe, corrida entre compradores e fecho são confirmados por REST e MongoDB reais', async ({
  page,
  request,
}) => {
  test.setTimeout(45000);
  const s = await subject(page, 1, 15000),
    id = s.auctions[0]!.body.id;
  await login(page, s.credentials, path + '/' + id);
  await expect(page.locator('.admin-auction-detail')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Ligação ativa' })).toBeVisible();
  const responses = await Promise.all(s.actors.slice(1).map((a) => bid(request, id, a.token)));
  expect(responses.map((r) => r.status()).sort()).toEqual([201, 409]);
  await expect(page.locator('.admin-auction-bids li')).toHaveCount(1);
  await expect(page.locator('.admin-auction-detail')).toContainText('Versão confirmada: 1');
  await expect(
    page.getByRole('button', { name: /Licitar|Editar leilão|Cancelar leilão/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Resultado confirmado pelo serviço' }),
  ).toBeVisible({ timeout: 20000 });
  const record = await db.db!.collection('auctions').findOne({ _id: new Types.ObjectId(id) });
  expect(record!.estado).toBe('terminado');
  await expect(page.locator('.admin-auction-result')).toContainText('301,00');
  expect(record!.resultado.bidId).toEqual(record!.licitacaoAtual.bidId);
  const out = process.env.DOCAMPO_ADMIN_AUCTION_SCREENSHOTS;
  if (out) {
    await inspect(page, String(page.viewportSize()!.width) + '-resultado');
    const headers = { Authorization: 'Bearer ' + s.adminToken };
    for (const [name, url] of [
      ['AdminAuctionDetail8C', '/admin/auctions/' + id],
      ['AdminAuctionPage8C', '/admin/auctions'],
      ['AdminAuctionBidPage8C', '/admin/auctions/' + id + '/bids'],
    ]) {
      const r = await request.get(api + url, { headers });
      expect(r.status()).toBe(200);
      const body = await r.json();
      if (name === 'AdminAuctionPage8C')
        expect(body.indicadores.valorOfertasVencedorasCent).toBe(30100);
      await writeFile(join(out, name + '.json'), JSON.stringify(body));
    }
  }
});
test('perda e restabelecimento de ligação recuperam ofertas persistidas sem duplicações', async ({
  page,
  request,
}) => {
  const s = await subject(page),
    id = s.auctions[0]!.body.id;
  await login(page, s.credentials, path + '/' + id);
  await expect(page.getByRole('status').filter({ hasText: 'Ligação ativa' })).toBeVisible();
  try {
    await page.context().setOffline(true);
    await page.evaluate(() => dispatchEvent(new Event('offline')));
    expect((await bid(request, id, s.actors[1]!.token)).status()).toBe(201);
    await page.context().setOffline(false);
    await page.evaluate(() => dispatchEvent(new Event('online')));
    await expect(page.locator('.admin-auction-bids li')).toHaveCount(1);
    await expect(page.locator('.admin-auction-detail')).toContainText('Versão confirmada: 1');
    await expect(page.getByRole('status').filter({ hasText: 'Ligação ativa' })).toBeVisible();
    expect(await db.db!.collection('bids').countDocuments({ leilao: new Types.ObjectId(id) })).toBe(
      1,
    );
  } finally {
    await page.context().setOffline(false);
  }
});
test('paginação real de 13 lotes combina filtros e normaliza página inexistente', async ({
  page,
}) => {
  const s = await subject(page, 13);
  await login(page, s.credentials);
  await expect(page.locator('.admin-auction-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Página seguinte', exact: true }).click();
  await expect(page.locator('.admin-auction-card')).toHaveCount(1);
  await page.getByLabel('Estado do leilão', { exact: true }).selectOption('cancelado');
  await expect(page).toHaveURL(/pagina=1/);
  await expect(
    page.getByRole('heading', { name: 'Nenhum leilão corresponde à consulta.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(page.locator('.admin-auction-card')).toHaveCount(12);
  await page.evaluate((to) => {
    history.pushState(null, '', to);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path + '?pagina=999&estado=ativo');
  await expect(page).toHaveURL(/pagina=2/);
  await expect(page.getByRole('heading', { name: 'O mercado em movimento.' })).toBeFocused();
});
test('segurança real bloqueia outros papéis e JWT emitido antes da suspensão', async ({
  page,
  request,
}) => {
  const s = await subject(page),
    id = s.auctions[0]!.body.id;
  for (const actor of s.actors)
    for (const suffix of ['', '/' + id, '/' + id + '/bids'])
      expect(
        (
          await request.get(api + '/admin/auctions' + suffix, {
            headers: { Authorization: 'Bearer ' + actor.token },
          })
        ).status(),
      ).toBe(403);
  expect((await request.get(api + '/admin/auctions')).status()).toBe(401);
  const headers = { Authorization: 'Bearer ' + s.adminToken };
  const detail = await request.get(api + '/admin/auctions/' + id, { headers }),
    body = await detail.json();
  expect(detail.status()).toBe(200);
  for (const f of ['criacao', 'comprador', 'reserva', 'historico', 'requestId', 'requestHash'])
    expect(JSON.stringify(body)).not.toContain('"' + f + '"');
  await db.db!.collection('users').updateOne({ _id: s.adminId }, { $set: { ativo: false } });
  expect((await request.get(api + '/admin/auctions', { headers })).status()).toBe(401);
});
for (const width of [320, 430, 768, 1024, 1280, 1440])
  test('supervisão real acessível e responsiva a ' + width + ' px', async ({ page, request }) => {
    const errors: string[] = [];
    let connections = 0;
    page.on('websocket', (socket) => {
      if (socket.url().includes('/socket.io')) connections++;
    });
    page.on('pageerror', (e) => errors.push(e.message));
    const s = await subject(page),
      id = s.auctions[0]!.body.id;
    await page.setViewportSize({ width, height: 900 });
    await login(page, s.credentials);
    await expect(page.locator('.admin-auction-card')).toHaveCount(1);
    await inspect(page, width + '-listagem');
    for (const field of await page.locator('.admin-auctions input,.admin-auctions select').all())
      await expect(field).toHaveAccessibleName(/.+/);
    await page.getByLabel('Identificador exato do leilão', { exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('ID da conta do produtor', { exact: true })).toBeFocused();
    const link = page.getByRole('link', { name: /Supervisionar leilão/ });
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.admin-auction-detail')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Ligação ativa' })).toBeVisible();
    await inspect(page, width + '-detalhe');
    expect((await bid(request, id, s.actors[1]!.token)).status()).toBe(201);
    await expect(page.locator('.admin-auction-bids li')).toHaveCount(1);
    await inspect(page, width + '-oferta');
    await page.route('**/api/admin/auctions/*', (route) => route.abort('failed'));
    await page.getByRole('button', { name: 'Atualizar supervisão', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(
      page.getByRole('group', { name: 'Recuperar consulta administrativa' }),
    ).toBeFocused();
    await inspect(page, width + '-erro');
    await page.unroute('**/api/admin/auctions/*');
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await inspect(page, width + '-recuperado');
    await page.getByRole('link', { name: '← Voltar aos leilões', exact: true }).click();
    await page.getByLabel('Estado do leilão', { exact: true }).selectOption('cancelado');
    await expect(
      page.getByRole('heading', { name: 'Nenhum leilão corresponde à consulta.' }),
    ).toBeVisible();
    await inspect(page, width + '-vazio');
    expect(errors).toEqual([]);
    expect(connections).toBeLessThanOrEqual(3);
  });
