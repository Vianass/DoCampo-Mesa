import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection, Types } from 'mongoose';
import { createUserModel } from '../../api/src/modules/users/user.model';
const api = 'http://127.0.0.1:3011/api',
  path = '/area/administrador/utilizadores';
let connection: ReturnType<typeof createConnection>, database: ReturnType<typeof createConnection>;
const ids: Types.ObjectId[] = [];
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
  const all = ids.splice(0);
  await database
    .db!.collection('user_state_audit')
    .deleteMany({ $or: [{ utilizadorId: { $in: all } }, { administradorId: { $in: all } }] });
  await database.db!.collection('users').deleteMany({ _id: { $in: all } });
});
test.afterAll(async () => {
  await connection?.close();
});
async function actor(request: APIRequestContext, admin = false, nome = 'Pessoa fictícia 8A') {
  const credentials = {
    nome,
    email: randomUUID() + '@example.invalid',
    password: 'Frase fictícia 8A ' + randomUUID(),
  };
  expect((await request.post(api + '/auth/register', { data: credentials })).status()).toBe(202);
  const model = createUserModel(database),
    row = await model.findOne({ emailNormalizado: credentials.email }).orFail();
  ids.push(row._id);
  if (admin) {
    row.papeis = ['administrador'];
    await row.save();
  }
  const response = await request.post(api + '/auth/login', {
    data: { email: credentials.email, password: credentials.password },
  });
  expect(response.status()).toBe(200);
  return { ...credentials, id: row._id, token: (await response.json()).accessToken as string };
}
type Actor = Awaited<ReturnType<typeof actor>>;
async function login(page: Page, who: Actor, destination = '/area/administrador') {
  await page.goto('/entrar?destino=' + encodeURIComponent(destination));
  await page.getByLabel('Email', { exact: true }).fill(who.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(destination + '$'));
  await page.locator('.account-identity').waitFor();
}
async function navigate(page: Page, to: string) {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
  }, to);
}
async function detail(page: Page, id: Types.ObjectId) {
  await navigate(page, path + '/' + id);
  await expect(page.locator('#admin-user-title')).toBeVisible();
}
async function change(page: Page, active: boolean) {
  await page
    .getByLabel('Motivo da alteração', { exact: true })
    .fill('Decisão fictícia de revisão do acesso.');
  await page
    .getByRole('button', { name: active ? 'Reativar conta' : 'Desativar conta', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Continuar análise' })).toBeFocused();
  const pending = page.waitForResponse(
    (r) => r.url().endsWith('/state') && r.request().method() === 'PATCH',
  );
  await page
    .getByRole('button', {
      name: active ? 'Confirmar reativação' : 'Confirmar desativação',
      exact: true,
    })
    .click();
  return pending;
}
async function inspect(page: Page, name: string, modal = false) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const r of await page
    .locator(
      '.admin-users input,.admin-users textarea,.admin-users select,.admin-users button,dialog[open] button',
    )
    .evaluateAll((els) =>
      els
        .filter((e) => e.getClientRects().length)
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { left: r.left, right: r.right, height: r.height };
        }),
    )) {
    expect(r.left).toBeGreaterThanOrEqual(-1);
    expect(r.right).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    expect(r.height).toBeGreaterThanOrEqual(44);
  }
  const out = process.env.DOCAMPO_ADMIN_USER_SCREENSHOTS;
  if (!out) return;
  await mkdir(out, { recursive: true });
  if (!modal) await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: join(out, name + '.png'),
    fullPage: !modal,
    animations: 'disabled',
  });
  await writeFile(join(out, name + '.yml'), await page.locator('body').ariaSnapshot());
  const session = await page.context().newCDPSession(page);
  await writeFile(
    join(out, name + '-ax.json'),
    JSON.stringify(await session.send('Accessibility.getFullAXTree')),
  );
  await session.detach();
}
test('dashboard e pesquisa/paginação são provenientes de MongoDB real', async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  const admin = await actor(request, true),
    prefix = 'Revisão8A ' + randomUUID().slice(0, 8);
  for (let i = 0; i < 13; i++) await actor(request, false, prefix + ' ' + i);
  await login(page, admin);
  const total = await database.db!.collection('users').countDocuments();
  await expect(
    page
      .locator('.admin-real-metrics>div')
      .filter({ has: page.getByText('Utilizadores registados', { exact: true }) })
      .getByRole('definition'),
  ).toHaveText(String(total));
  await page.getByRole('link', { name: 'Gerir utilizadores', exact: true }).click();
  await page.getByLabel('Nome ou email', { exact: true }).fill(prefix);
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await expect(page.locator('.admin-user-cards article')).toHaveCount(12);
  await page.getByRole('button', { name: 'Página seguinte', exact: true }).click();
  await expect(page.locator('.admin-user-cards article')).toHaveCount(1);
  await page.getByLabel('Estado da conta', { exact: true }).selectOption('inativo');
  await expect(
    page.getByRole('heading', { name: 'Nenhum utilizador corresponde à consulta.' }),
  ).toBeVisible();
});
test('React desativa/reativa com auditoria real; JWT antigo perde acesso durante suspensão', async ({
  page,
  request,
  browser,
}) => {
  const admin = await actor(request, true),
    buyer = await actor(request),
    context = await browser.newContext(),
    other = await context.newPage();
  try {
    await login(other, buyer, '/area/comprador');
    await login(page, admin);
    await detail(page, buyer.id);
    expect((await change(page, false)).status()).toBe(200);
    await expect(page.locator('#admin-user-title')).toBeFocused();
    expect((await createUserModel(database).findById(buyer.id).orFail()).ativo).toBe(false);
    expect(
      (
        await request.get(api + '/auth/me', { headers: { Authorization: 'Bearer ' + buyer.token } })
      ).status(),
    ).toBe(401);
    await other.evaluate(() => dispatchEvent(new Event('focus')));
    await expect(other).toHaveURL(/\/entrar\?destino=/);
    await expect(page.locator('.admin-account-audit')).toContainText('Decisão fictícia');
    expect((await change(page, true)).status()).toBe(200);
    await expect(page.locator('#admin-user-title')).toBeFocused();
    expect((await createUserModel(database).findById(buyer.id).orFail()).papeis).toEqual([
      'comprador',
    ]);
    expect(
      await database.db!.collection('user_state_audit').countDocuments({ utilizadorId: buyer.id }),
    ).toBe(2);
    await login(other, buyer, '/area/comprador');
    await expect(other.locator('.account-identity')).toContainText(buyer.nome);
  } finally {
    await context.close();
  }
});
test('dois administradores reais usam If-Match e só uma alteração é confirmada', async ({
  page,
  request,
  browser,
}) => {
  const a = await actor(request, true),
    b = await actor(request, true),
    u = await actor(request),
    context = await browser.newContext(),
    other = await context.newPage();
  try {
    await login(page, a);
    await detail(page, u.id);
    await login(other, b);
    await detail(other, u.id);
    expect((await change(other, false)).status()).toBe(200);
    const stale = await change(page, false);
    expect(stale.status()).toBe(412);
    expect(stale.request().headers()['if-match']).toMatch(/^"[A-Za-z0-9_-]{43}"$/);
    await expect(page.getByRole('group', { name: 'Recuperar alteração da conta' })).toBeFocused();
    await expect(page.getByRole('alert')).toContainText('A tua alteração não foi confirmada');
    await expect(page.getByRole('form', { name: 'Alterar estado da conta' })).toHaveCount(0);
    const event = await database.db!.collection('user_state_audit').findOne({ utilizadorId: u.id });
    expect(event!.administradorId).toEqual(b.id);
    expect(
      await database.db!.collection('user_state_audit').countDocuments({ utilizadorId: u.id }),
    ).toBe(1);
  } finally {
    await context.close();
  }
});
test('resposta perdida depois de persistir consulta estado/auditoria sem repetir PATCH', async ({
  page,
  request,
}) => {
  const a = await actor(request, true),
    u = await actor(request);
  await login(page, a);
  await detail(page, u.id);
  let posts = 0;
  await page.route('**/api/admin/users/*/state', async (route) => {
    posts++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort();
  });
  await page.getByLabel('Motivo da alteração', { exact: true }).fill('Revisão fictícia.');
  await page.getByRole('button', { name: 'Desativar conta', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar desativação' }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível confirmar');
  await expect(page.getByRole('form', { name: 'Alterar estado da conta' })).toHaveCount(0);
  expect(posts).toBe(1);
  expect((await createUserModel(database).findById(u.id).orFail()).ativo).toBe(false);
  expect(
    await database.db!.collection('user_state_audit').countDocuments({ utilizadorId: u.id }),
  ).toBe(1);
});
test('autodesativação e acessos administrativos são recusados pela API e React reais', async ({
  page,
  request,
}) => {
  const a = await actor(request, true),
    u = await actor(request);
  await login(page, a);
  await detail(page, a.id);
  await expect(page.getByRole('form', { name: 'Alterar estado da conta' })).toHaveCount(0);
  const own = await request.get(api + '/admin/users/' + a.id, {
    headers: { Authorization: 'Bearer ' + a.token },
  });
  expect(
    (
      await request.patch(api + '/admin/users/' + a.id + '/state', {
        headers: { Authorization: 'Bearer ' + a.token, 'If-Match': own.headers().etag! },
        data: { ativo: false, motivo: 'Teste fictício' },
      })
    ).status(),
  ).toBe(409);
  for (const endpoint of ['/dashboard', '/users', '/users/' + u.id, '/users/' + u.id + '/audit']) {
    const response = await request.get(api + '/admin' + endpoint, {
      headers: { Authorization: 'Bearer ' + u.token },
    });
    expect(response.status()).toBe(403);
    expect(JSON.stringify(await response.json())).not.toContain(u.email);
  }
  await database
    .db!.collection('users')
    .updateOne({ _id: a.id }, { $set: { ativo: false }, $inc: { revisaoOperacional: 1 } });
  await page.getByRole('button', { name: 'Atualizar conta' }).click();
  await expect(page).toHaveURL(/\/entrar\?destino=/);
});
for (const width of [320, 430, 768, 1024, 1280, 1440])
  test('administração real responsiva e acessível a ' + width + 'px', async ({ page, request }) => {
    await page.setViewportSize({ width, height: 960 });
    const a = await actor(request, true),
      u = await actor(request);
    await login(page, a);
    await expect(page.locator('.admin-real-metrics')).toBeVisible();
    const identity = page.locator('#account-identity-title');
    await expect(identity).toHaveText('A tua conta.');
    const titleMetrics = await identity.evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(el).lineHeight),
    }));
    expect(titleMetrics.height).toBeLessThanOrEqual(titleMetrics.lineHeight * 1.2);
    await inspect(page, width + '-dashboard');
    await page.getByRole('link', { name: 'Gerir utilizadores', exact: true }).click();
    await expect(page.locator('.admin-user-cards article').first()).toBeVisible();
    await inspect(page, width + '-utilizadores');
    await detail(page, u.id);
    await inspect(page, width + '-conta');
    await page.getByRole('button', { name: 'Desativar conta', exact: true }).click();
    await expect(page.getByLabel('Motivo da alteração', { exact: true })).toBeFocused();
    await inspect(page, width + '-motivo-obrigatorio');
    await page
      .getByLabel('Motivo da alteração', { exact: true })
      .fill('Motivo fictício longo para a alteração. '.repeat(35));
    await page.getByRole('button', { name: 'Desativar conta', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Continuar análise' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(
      page.getByRole('region', { name: 'Motivo da alteração a confirmar' }),
    ).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Confirmar desativação' })).toBeFocused();
    await inspect(page, width + '-confirmacao', true);
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/state') && r.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Confirmar desativação' }).click();
    expect((await response).status()).toBe(200);
    await expect(page.locator('#admin-user-title')).toBeFocused();
    await expect(page.locator('.admin-account-audit')).toContainText('Conta desativada');
    await inspect(page, width + '-desativada-auditoria');
  });
