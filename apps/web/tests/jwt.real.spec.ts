import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'mongoose';
import { createUserModel } from '../../api/src/modules/users/user.model';
import type { Role } from '../src/features/auth/types';
const base = 'http://127.0.0.1:3011/api';
let adminConnection: Awaited<ReturnType<ReturnType<typeof createConnection>['asPromise']>>;
let database: ReturnType<typeof createConnection>;
test.beforeAll(async () => {
  adminConnection = await createConnection(
    'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
    { dbName: 'admin', serverSelectionTimeoutMS: 5000 },
  ).asPromise();
  const names = (await adminConnection.db!.admin().listDatabases()).databases
    .map((d) => d.name)
    .filter((n) => n.startsWith('docampo_test_web_'));
  expect(names).toHaveLength(1);
  database = adminConnection.useDb(names[0]!);
});
test.afterAll(async () => {
  await adminConnection?.close();
});
async function account(
  request: import('@playwright/test').APIRequestContext,
  roles: Role[] = ['comprador'],
) {
  const data = {
    nome: 'Pessoa fictícia JWT ' + randomUUID().slice(0, 8),
    email: 'jwt-' + randomUUID() + '@example.invalid',
    password: 'Frase apenas para teste ' + randomUUID(),
  };
  expect((await request.post(base + '/auth/register', { data })).status()).toBe(202);
  if (roles.join() !== 'comprador') {
    const User = createUserModel(database);
    const user = await User.findOne({ emailNormalizado: data.email }).select('+passwordHash');
    user!.papeis = roles;
    await user!.save();
  }
  return data;
}
async function login(
  page: import('@playwright/test').Page,
  user: Awaited<ReturnType<typeof account>>,
) {
  await page.goto('/entrar');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(user.password);
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/auth/login');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  const body = await result.json();
  await expect(page.locator('.account-identity')).toContainText(user.nome);
  return body as { accessToken: string; expiresAt: string };
}
async function navigate(page: import('@playwright/test').Page, path: string) {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
test('registo real 202 → login → /me → conta pessoal sem dados fictícios associados', async ({
  page,
}) => {
  const user = {
    nome: 'Conta fictícia de registo',
    email: 'registo-' + randomUUID() + '@example.invalid',
    password: 'Frase de registo fictícia ' + randomUUID(),
  };
  await page.goto('/registo?perfil=produtor');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.getByLabel('Nome', { exact: true }).fill(user.nome);
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(user.password);
  await page.getByLabel('Confirmação da palavra-passe', { exact: true }).fill(user.password);
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/auth/register');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(202);
  expect(Object.keys(result.request().postDataJSON()).sort()).toEqual([
    'email',
    'nome',
    'password',
  ]);
  await expect(page.locator('.auth-form-status')).toContainText('Pedido de registo recebido');
  await expect(page.locator('.header-actions__login')).toBeVisible();
  await login(page, user);
  await expect(
    page.locator('.buyer-order-card,.review-card,.buyer-summary,.producer-metrics,.admin-metrics'),
  ).toHaveCount(0);
  const stored = await createUserModel(database).findOne({ emailNormalizado: user.email }).lean();
  expect(stored!.papeis).toEqual(['comprador']);
});
test('emails novos e duplicados têm o mesmo HTTP 202 sem substituir a conta', async ({
  request,
}) => {
  const user = await account(request);
  const result = await request.post(base + '/auth/register', {
    data: { ...user, nome: 'Nome que não deve substituir' },
  });
  expect(result.status()).toBe(202);
  expect(await result.json()).toEqual({
    mensagem: 'Pedido de registo recebido. Tenta iniciar sessão com os dados indicados.',
  });
  const record = await createUserModel(database).findOne({ emailNormalizado: user.email }).lean();
  expect(record!.nome).toBe(user.nome);
  expect(await createUserModel(database).countDocuments({ emailNormalizado: user.email })).toBe(1);
});
test('login inválido, conta ausente e registo com papel injetado não autenticam', async ({
  page,
  request,
}) => {
  const user = await account(request);
  const wrong = await request.post(base + '/auth/login', {
    data: { email: user.email, password: 'Frase errada apenas para teste' },
  });
  const missing = await request.post(base + '/auth/login', {
    data: {
      email: 'ausente-' + randomUUID() + '@example.invalid',
      password: 'Frase errada apenas para teste',
    },
  });
  expect(wrong.status()).toBe(401);
  expect(missing.status()).toBe(401);
  expect(await wrong.json()).toEqual(await missing.json());
  expect(
    (
      await request.post(base + '/auth/register', {
        data: {
          ...user,
          email: 'escalar-' + randomUUID() + '@example.invalid',
          papeis: ['administrador'],
        },
      })
    ).status(),
  ).toBe(400);
  await page.goto('/area/administrador');
  await expect(page).toHaveURL(/\/entrar\?destino=/);
});
test('JWT real adulterado é recusado pelo backend antes da área pessoal', async ({
  page,
  request,
}) => {
  const user = await account(request);
  await page.route(
    (url) => url.pathname === '/api/auth/me',
    async (route) => {
      const headers = route.request().headers(),
        parts = headers.authorization!.split(' ')[1]!.split('.');
      parts[2] = (parts[2]![0] === 'A' ? 'B' : 'A') + parts[2]!.slice(1);
      await route.continue({ headers: { ...headers, authorization: 'Bearer ' + parts.join('.') } });
    },
  );
  await page.goto('/entrar');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível iniciar sessão');
  await expect(page.locator('.account-identity')).toHaveCount(0);
});
test('expiração natural do JWT real limpa o React e o serviço devolve 401', async ({
  page,
  request,
}) => {
  test.setTimeout(75000);
  const user = await account(request);
  const result = await login(page, user);
  await expect(page).toHaveURL(/\/entrar\?destino=/, { timeout: 65000 });
  await expect(page.locator('.auth-session-note')).toContainText('sessão terminou');
  await expect
    .poll(async () =>
      (
        await request.get(base + '/auth/me', {
          headers: { Authorization: 'Bearer ' + result.accessToken },
        })
      ).status(),
    )
    .toBe(401);
});
test('papéis e inativação atuais da base MongoDB alteram a navegação sem confiar no JWT', async ({
  page,
  request,
}) => {
  const user = await account(request);
  await login(page, user);
  const User = createUserModel(database);
  const record = await User.findOne({ emailNormalizado: user.email }).select('+passwordHash');
  record!.papeis = ['produtor'];
  await record!.save();
  await navigate(page, '/area/comprador/encomendas');
  await expect(page.getByRole('heading', { name: 'Não tens acesso a esta área.' })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar à minha área' }).click();
  await expect(page).toHaveURL(/\/area\/produtor$/);
  record!.ativo = false;
  await record!.save();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page).toHaveURL(/\/entrar\?destino=/);
  await expect(page.locator('.account-identity')).toHaveCount(0);
});
test('contas produtor/administrador e múltiplas capacidades só usam os papéis reais', async ({
  page,
  request,
}) => {
  for (const roles of [['produtor'], ['administrador'], ['comprador', 'produtor']] as Role[][]) {
    const user = await account(request, roles);
    await login(page, user);
    await expect(page.locator('.account-identity')).toContainText(user.nome);
    // A visão geral produtora já usa agregados reais: a conta nova não tem encomendas.
    if (roles[0] === 'produtor') {
      await expect(page.getByLabel('Indicadores reais de vendas')).toBeVisible();
      await expect(page.locator('.producer-metrics dd')).toHaveText(['0', '0', '0', '0,00 €']);
      await expect(page.locator('.producer-live-card')).toHaveCount(0);
      await expect(page.locator('.admin-metrics,.buyer-summary')).toHaveCount(0);
    } else
      await expect(page.locator('.admin-metrics,.producer-metrics,.buyer-summary')).toHaveCount(0);
    if (roles.length > 1) {
      await page.getByRole('link', { name: 'Área de Produtor', exact: true }).click();
      await expect(page).toHaveURL(/\/area\/produtor$/);
    }
    await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
    await expect(page).toHaveURL(/\/entrar$/);
  }
});
test('403 real para recurso de produtor não concede privilégios a uma conta compradora', async ({
  page,
  request,
}) => {
  const user = await account(request),
    result = await login(page, user);
  expect(
    (
      await request.get(base + '/me/products', {
        headers: { Authorization: 'Bearer ' + result.accessToken },
      })
    ).status(),
  ).toBe(403);
  await navigate(page, '/area/administrador');
  await expect(page.getByRole('heading', { name: 'Não tens acesso a esta área.' })).toBeVisible();
});
test('logout real descarta a sessão local mas não revoga o JWT já emitido', async ({
  page,
  request,
}) => {
  const user = await account(request),
    result = await login(page, user);
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/auth/logout');
  await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
  const logout = await response;
  expect(logout.status()).toBe(200);
  expect((await logout.json()).revogado).toBe(false);
  await expect(page).toHaveURL(/\/entrar$/);
  expect(
    (
      await request.get(base + '/auth/me', {
        headers: { Authorization: 'Bearer ' + result.accessToken },
      })
    ).status(),
  ).toBe(200);
});
test('recarregar perde só a sessão e conserva a cesta sem expor credenciais', async ({
  page,
  request,
}) => {
  await page.goto('/produtos/ee685adf80156cb9e1e85c27');
  await page
    .getByRole('button', { name: 'Adicionar Tomate coração-de-boi ao carrinho', exact: true })
    .click();
  const user = await account(request),
    result = await login(page, user);
  const storage = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]),
  );
  expect(storage.includes(result.accessToken)).toBe(false);
  expect(storage.includes(user.password)).toBe(false);
  expect(page.url().includes(result.accessToken)).toBe(false);
  expect((await page.locator('body').innerText()).includes(result.accessToken)).toBe(false);
  await page.reload();
  await expect(page).toHaveURL(/\/entrar\?destino=/);
  await page.getByRole('link', { name: '← Continuar pelo mercado' }).click();
  await page.locator('.header-cart').click();
  await expect(page.getByLabel('Quantidade de Tomate coração-de-boi', { exact: true })).toHaveValue(
    '250',
  );
});
for (const width of [320, 430, 768, 1024, 1280, 1440])
  test(`autenticação real e identidade sem overflow a ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const user = await account(request);
    await login(page, user);
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `/private/tmp/docampo-5c-account-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
    await expect(page).toHaveURL(/\/entrar$/);
    await expect(page.getByRole('form', { name: 'Formulário de entrada' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `/private/tmp/docampo-5c-login-${width}.png`, fullPage: true });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
