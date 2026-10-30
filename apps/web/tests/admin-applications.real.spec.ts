import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection, Types } from 'mongoose';
import { createUserModel } from '../../api/src/modules/users/user.model';
import { applicationInput } from './support/producer-application-fixtures';
import { adminApplicationsPath } from '../src/features/admin-applications/contracts';
const api = 'http://127.0.0.1:3011/api';
let connection: ReturnType<typeof createConnection>, database: ReturnType<typeof createConnection>;
const users: Types.ObjectId[] = [];
test.beforeAll(async () => {
  connection = await createConnection(
    'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
    { dbName: 'admin', serverSelectionTimeoutMS: 5000 },
  ).asPromise();
  const names = (await connection.db!.admin().listDatabases()).databases.filter((item) =>
    item.name.startsWith('docampo_test_web_'),
  );
  expect(names).toHaveLength(1);
  database = connection.useDb(names[0]!.name);
});
test.afterEach(async () => {
  const ids = users.splice(0);
  await database.db!.collection('producers').deleteMany({ userId: { $in: ids } });
  await database.db!.collection('users').deleteMany({ _id: { $in: ids } });
});
test.afterAll(async () => {
  await connection?.close();
});
async function actor(request: APIRequestContext, admin = false) {
  const credentials = {
    nome: 'Pessoa fictícia 7C',
    email: randomUUID() + '@example.invalid',
    password: 'Frase apenas para teste 7C ' + randomUUID(),
  };
  expect((await request.post(api + '/auth/register', { data: credentials })).status()).toBe(202);
  const User = createUserModel(database),
    account = await User.findOne({ emailNormalizado: credentials.email })
      .select('+passwordHash')
      .orFail();
  users.push(account._id);
  if (admin) {
    account.papeis = ['administrador'];
    await account.save();
  }
  const response = await request.post(api + '/auth/login', {
    data: { email: credentials.email, password: credentials.password },
  });
  expect(response.status()).toBe(200);
  return { ...credentials, id: account._id, token: (await response.json()).accessToken as string };
}
type Actor = Awaited<ReturnType<typeof actor>>;
async function candidate(request: APIRequestContext) {
  const user = await actor(request);
  const input = {
    ...applicationInput,
    nomePublico: 'Origem fictícia 7C ' + randomUUID().slice(0, 8),
  };
  const response = await request.post(api + '/me/producer-application', {
    headers: { Authorization: 'Bearer ' + user.token },
    data: input,
  });
  expect(response.status()).toBe(201);
  return { ...user, application: (await response.json()) as { id: string }, input };
}
async function login(page: Page, user: Actor, destination = '/area/administrador') {
  await page.goto('/entrar?destino=' + encodeURIComponent(destination));
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(destination.replace(/[?]/g, '\\?') + '$'));
}
async function navigate(page: Page, path: string) {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function open(page: Page, id: string) {
  await navigate(page, adminApplicationsPath + '/' + id);
  await expect(page.locator('#admin-application-state')).toBeVisible();
}
async function decide(
  page: Page,
  outcome: 'approve' | 'reject',
  reason = 'Completa a descrição da atividade agrícola.',
) {
  if (outcome === 'reject')
    await page.getByLabel('Motivo da rejeição', { exact: true }).fill(reason);
  await page
    .getByRole('button', {
      name: outcome === 'approve' ? 'Aprovar candidatura' : 'Rejeitar candidatura',
      exact: true,
    })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/' + outcome) && r.request().method() === 'POST',
  );
  await page
    .getByRole('button', {
      name: outcome === 'approve' ? 'Confirmar aprovação' : 'Confirmar rejeição',
      exact: true,
    })
    .click();
  return response;
}
async function inspect(page: Page, name: string, modal = false) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const rect of await page
    .locator(
      '.admin-applications input,.admin-applications textarea,.admin-applications select,.admin-applications button,.admin-decision-dialog[open] button',
    )
    .evaluateAll((elements) =>
      elements
        .filter((el) => el.getClientRects().length)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, height: r.height };
        }),
    )) {
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
    expect(rect.height).toBeGreaterThanOrEqual(44);
  }
  const directory = process.env.DOCAMPO_ADMIN_APPLICATION_SCREENSHOTS;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  if (!modal) await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.screenshot({
    path: join(directory, name + '.png'),
    fullPage: !modal,
    animations: 'disabled',
  });
  await writeFile(join(directory, name + '.yml'), await page.locator('body').ariaSnapshot());
  const session = await page.context().newCDPSession(page);
  await writeFile(
    join(directory, name + '-ax.json'),
    JSON.stringify(await session.send('Accessibility.getFullAXTree')),
  );
  await session.detach();
}
test('listagem, filtros, paginação e contagens utilizam dados reais', async ({ page, request }) => {
  test.setTimeout(60000);
  const admin = await actor(request, true);
  const candidates = [];
  for (let i = 0; i < 13; i++) candidates.push(await candidate(request));
  await login(page, admin);
  await expect(
    page.getByRole('status').filter({ hasText: '13 candidaturas pendentes no total.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Analisar candidaturas', exact: true }).click();
  await expect(page.locator('.admin-application-cards article')).toHaveCount(12);
  await page.getByRole('button', { name: 'Página seguinte', exact: true }).click();
  await expect(page.locator('.admin-application-cards article')).toHaveCount(1);
  await expect(page.locator('#admin-list-title')).toBeFocused();
  await page.getByLabel('Estado das candidaturas').selectOption('rejeitado');
  await expect(
    page.getByRole('heading', { name: 'Sem candidaturas para este estado.' }),
  ).toBeVisible();
  await page.getByLabel('Estado das candidaturas').selectOption('pendente');
  await page.getByLabel('Candidaturas por página').selectOption('24');
  await expect(page.locator('.admin-application-cards article')).toHaveCount(13);
  await page.getByLabel('Ordenar por submissão').selectOption('antigas');
  await expect(
    page.getByRole('link', { name: new RegExp(candidates[0]!.input.nomePublico) }),
  ).toBeVisible();
});
test('aprovação real preserva papéis e permite confirmação pelo comprador da Fase 7B', async ({
  page,
  request,
  browser,
}) => {
  const admin = await actor(request, true),
    user = await candidate(request);
  const buyerContext = await browser.newContext(),
    buyer = await buyerContext.newPage();
  try {
    await login(buyer, user, '/area/candidatura-produtor');
    await expect(
      buyer.getByRole('heading', { name: 'Recebemos a tua candidatura.' }),
    ).toBeVisible();
    await login(page, admin);
    await open(page, user.application.id);
    const result = await decide(page, 'approve');
    expect(result.status()).toBe(200);
    expect(result.request().headers()['if-match']).toMatch(/^"[A-Za-z0-9_-]{43}"$/);
    await expect(page.locator('#admin-application-state')).toBeFocused();
    await expect(page.getByRole('form', { name: 'Decidir candidatura' })).toHaveCount(0);
    expect((await createUserModel(database).findById(user.id).orFail()).papeis).toEqual([
      'comprador',
      'produtor',
    ]);
    await buyer.getByRole('button', { name: 'Atualizar estado', exact: true }).click();
    await expect(buyer.getByRole('link', { name: 'Ir para a área do produtor' })).toBeVisible();
    expect((await createUserModel(database).findById(admin.id).orFail()).papeis).toEqual([
      'administrador',
    ]);
    await page.getByRole('link', { name: '← Voltar à listagem' }).click();
    await page.getByLabel('Estado das candidaturas').selectOption('pendente');
    await expect(
      page.getByRole('heading', { name: 'Sem candidaturas para este estado.' }),
    ).toBeVisible();
  } finally {
    await buyerContext.close();
  }
});
test('rejeição real, reapresentação e histórico administrativo preservam motivos e autor', async ({
  page,
  request,
}) => {
  const admin = await actor(request, true),
    user = await candidate(request);
  await login(page, admin);
  await open(page, user.application.id);
  const reason = page.getByLabel('Motivo da rejeição', { exact: true });
  await page.getByRole('button', { name: 'Rejeitar candidatura', exact: true }).click();
  await expect(reason).toBeFocused();
  expect((await decide(page, 'reject', 'Indica a origem e os produtos cultivados.')).status()).toBe(
    200,
  );
  await expect(page.locator('.admin-application-reason')).toContainText('Indica a origem');
  const own = await request.get(api + '/me/producer-application', {
    headers: { Authorization: 'Bearer ' + user.token },
  });
  expect(JSON.stringify(await own.json())).not.toContain('administradorId');
  expect(
    (
      await request.post(api + '/me/producer-application', {
        headers: { Authorization: 'Bearer ' + user.token },
        data: { ...user.input, descricao: 'Descrição fictícia revista e completa.' },
      })
    ).status(),
  ).toBe(201);
  await page.getByRole('button', { name: 'Atualizar candidatura', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Decidir candidatura' })).toBeVisible();
  await page.getByText('Tentativas anteriores (1)', { exact: true }).click();
  await expect(page.locator('.admin-application-history')).toContainText('Indica a origem');
  await expect(page.locator('.admin-application-history')).toContainText(admin.id.toHexString());
  await expect(page.locator('.admin-application-history')).toContainText(user.input.descricao);
  const approval = await decide(page, 'approve');
  expect(approval.status()).toBe(200);
  expect((await approval.json()).historico).toHaveLength(1);
  expect((await createUserModel(database).findById(user.id).orFail()).papeis).toEqual([
    'comprador',
    'produtor',
  ]);
});
test('dois administradores reais: decisão obsoleta recebe 412 e recarrega a decisão vencedora', async ({
  page,
  request,
  browser,
}) => {
  const adminA = await actor(request, true),
    adminB = await actor(request, true),
    user = await candidate(request),
    context = await browser.newContext(),
    second = await context.newPage();
  try {
    await login(page, adminA);
    await open(page, user.application.id);
    await login(second, adminB);
    await open(second, user.application.id);
    expect(
      (
        await decide(second, 'reject', 'Necessita de informação adicional sobre a origem.')
      ).status(),
    ).toBe(200);
    const result = await decide(page, 'approve');
    expect(result.status()).toBe(412);
    await expect(page.getByRole('group', { name: 'Recuperar decisão' })).toBeFocused();
    await expect(page.getByRole('alert')).toContainText('A candidatura mudou');
    await expect(page.locator('.admin-application-reason')).toContainText(
      'Necessita de informação adicional',
    );
    await expect(page.getByRole('form', { name: 'Decidir candidatura' })).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({ hasText: 'A aprovação foi confirmada' }),
    ).toHaveCount(0);
    const profile = await database.db!.collection('producers').findOne({ userId: user.id });
    expect(profile!.aprovacao.estado).toBe('rejeitado');
    expect(profile!.aprovacao.decisao.autor.toHexString()).toBe(adminB.id.toHexString());
    expect((await createUserModel(database).findById(user.id).orFail()).papeis).toEqual([
      'comprador',
    ]);
  } finally {
    await context.close();
  }
});
test('resposta perdida depois do commit consulta o estado real sem repetir a decisão', async ({
  page,
  request,
}) => {
  const admin = await actor(request, true),
    user = await candidate(request);
  await login(page, admin);
  await open(page, user.application.id);
  let posts = 0;
  await page.route('**/api/admin/producer-applications/*/approve', async (route) => {
    posts++;
    const result = await route.fetch();
    expect(result.status()).toBe(200);
    await route.abort();
  });
  await page.getByRole('button', { name: 'Aprovar candidatura', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar aprovação', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível confirmar');
  await expect(
    page.getByText('Esta tentativa já tem uma decisão.', { exact: false }),
  ).toBeVisible();
  expect(posts).toBe(1);
  expect((await createUserModel(database).findById(user.id).orFail()).papeis).toEqual([
    'comprador',
    'produtor',
  ]);
});
test('permissões e privacidade são aplicadas pela API e pelo React', async ({ page, request }) => {
  const admin = await actor(request, true),
    user = await candidate(request);
  for (const path of [
    '/admin/producer-applications',
    '/admin/producer-applications/' + user.application.id,
  ])
    expect(
      (
        await request.get(api + path, { headers: { Authorization: 'Bearer ' + user.token } })
      ).status(),
    ).toBe(403);
  await login(page, admin);
  await open(page, user.application.id);
  await expect(page.locator('.admin-applications')).not.toContainText(user.email);
  await database
    .db!.collection('users')
    .updateOne(
      { _id: admin.id },
      { $set: { papeis: ['comprador'] }, $inc: { revisaoOperacional: 1 } },
    );
  await page.getByRole('button', { name: 'Atualizar candidatura', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('não tem acesso administrativo');
  await expect(page.locator('.application-data')).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirmar acesso administrativo' }).click();
  await expect(page.getByRole('heading', { name: 'Não tens acesso a esta área.' })).toBeVisible();
});
test('conta administrativa inativa perde acesso e dados privados', async ({ page, request }) => {
  const admin = await actor(request, true),
    user = await candidate(request);
  await login(page, admin);
  await open(page, user.application.id);
  await database
    .db!.collection('users')
    .updateOne({ _id: admin.id }, { $set: { ativo: false }, $inc: { revisaoOperacional: 1 } });
  await page.getByRole('button', { name: 'Atualizar candidatura', exact: true }).click();
  await expect(page).toHaveURL(/\/entrar\?destino=/);
  await expect(page.locator('.admin-applications')).toHaveCount(0);
});
test('candidato entretanto inativo recebe 409 sem conceder capacidades', async ({
  page,
  request,
}) => {
  const admin = await actor(request, true),
    user = await candidate(request);
  await login(page, admin);
  await open(page, user.application.id);
  await database
    .db!.collection('users')
    .updateOne({ _id: user.id }, { $set: { ativo: false }, $inc: { revisaoOperacional: 1 } });
  const result = await decide(page, 'approve');
  expect(result.status()).toBe(409);
  expect((await result.json()).codigo).toBe('CANDIDATO_INELEGIVEL');
  await expect(page.getByRole('alert')).toContainText('já não é elegível');
  await expect(page.getByRole('form', { name: 'Decidir candidatura' })).toHaveCount(0);
  expect((await createUserModel(database).findById(user.id).orFail()).papeis).toEqual([
    'comprador',
  ]);
});
test('falha de transporte real na listagem é recuperável sem expor dados', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 320, height: 960 });
  const admin = await actor(request, true);
  await candidate(request);
  await login(page, admin);
  const failure = async (route: import('@playwright/test').Route) => route.abort();
  await page.route('**/api/admin/producer-applications?**', failure);
  await page.getByRole('link', { name: 'Analisar candidaturas', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Recuperar listagem' })).toBeFocused();
  await expect(page.getByRole('alert')).toBeInViewport({ ratio: 1 });
  await inspect(page, '320-erro-listagem');
  await page.unroute('**/api/admin/producer-applications?**', failure);
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.locator('.admin-application-cards article')).toHaveCount(1);
});
for (const width of [320, 430, 768, 1024, 1280, 1440])
  test(
    'listagem detalhe e confirmações reais responsivas a ' + width + 'px',
    async ({ page, request }) => {
      await page.setViewportSize({ width, height: 960 });
      const admin = await actor(request, true),
        user = await candidate(request);
      await login(page, admin);
      await page.getByRole('link', { name: 'Analisar candidaturas', exact: true }).click();
      await expect(page.locator('.admin-application-cards article')).toHaveCount(1);
      await inspect(page, width + '-listagem');
      await page.getByRole('link', { name: /Consultar candidatura de/ }).click();
      await expect(page.getByRole('form', { name: 'Decidir candidatura' })).toBeVisible();
      await inspect(page, width + '-detalhe');
      await page.getByRole('button', { name: 'Aprovar candidatura', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Continuar análise' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('button', { name: 'Confirmar aprovação', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Continuar análise' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(
        page.getByRole('button', { name: 'Confirmar aprovação', exact: true }),
      ).toBeFocused();
      await inspect(page, width + '-confirmar-aprovacao', true);
      await page.keyboard.press('Escape');
      await expect(
        page.getByRole('button', { name: 'Aprovar candidatura', exact: true }),
      ).toBeFocused();
      await page.getByRole('button', { name: 'Rejeitar candidatura', exact: true }).click();
      await expect(page.getByLabel('Motivo da rejeição', { exact: true })).toBeFocused();
      await inspect(page, width + '-motivo-obrigatorio');
      await page
        .getByLabel('Motivo da rejeição', { exact: true })
        .fill('Descreve os produtos da exploração.');
      await page.getByRole('button', { name: 'Rejeitar candidatura', exact: true }).click();
      await inspect(page, width + '-confirmar-rejeicao', true);
      const result = page.waitForResponse(
        (r) => r.url().endsWith('/reject') && r.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Confirmar rejeição', exact: true }).click();
      expect((await result).status()).toBe(200);
      await expect(page.locator('#admin-application-state')).toBeFocused();
      await inspect(page, width + '-rejeitada');
      await page.getByRole('link', { name: '← Voltar à listagem' }).click();
      await expect(
        page.getByRole('heading', { name: 'Sem candidaturas para este estado.' }),
      ).toBeVisible();
      await inspect(page, width + '-sem-resultados');
      const profile = await database.db!.collection('producers').findOne({ userId: user.id });
      expect(profile!.aprovacao.estado).toBe('rejeitado');
    },
  );

test('página inexistente e última candidatura decidida recuperam a página real sem perder filtros', async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 960 });
  const admin = await actor(request, true);
  const candidates = [];
  for (let index = 0; index < 13; index++) candidates.push(await candidate(request));
  await login(page, admin);
  await expect(
    page.getByRole('status').filter({ hasText: '13 candidaturas pendentes no total.' }),
  ).toBeVisible();
  const queries: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.pathname === '/api/admin/producer-applications') queries.push(url.search);
  });
  await navigate(
    page,
    adminApplicationsPath + '?pagina=1000&porPagina=12&ordem=antigas&estado=pendente',
  );
  await expect(page).toHaveURL(/pagina=2&porPagina=12&ordem=antigas&estado=pendente$/);
  await expect(page.locator('.admin-application-cards article')).toHaveCount(1);
  await expect(page.getByText('Página 2 de 2', { exact: true })).toBeVisible();
  const initialPages = queries.map((query) => new URLSearchParams(query).get('pagina'));
  expect(initialPages.filter((value, index) => value !== initialPages[index - 1])).toEqual([
    '1000',
    '2',
  ]);
  expect(initialPages.filter((value) => value === '2')).toHaveLength(1);
  await inspect(page, '1440-pagina-corrigida');
  await page.getByRole('link', { name: /Consultar candidatura de/ }).click();
  await expect(page.getByRole('form', { name: 'Decidir candidatura' })).toBeVisible();
  expect((await decide(page, 'approve')).status()).toBe(200);
  const profile = await database
    .db!.collection('producers')
    .findOne({ userId: candidates[12]!.id });
  expect(profile!.aprovacao.estado).toBe('aprovado');
  queries.length = 0;
  await page.getByRole('link', { name: '← Voltar à listagem' }).click();
  await expect(page).toHaveURL(/pagina=1&porPagina=12&ordem=antigas&estado=pendente$/);
  await expect(page.locator('.admin-application-cards article')).toHaveCount(12);
  await expect(page.locator('#admin-list-title')).toBeFocused();
  const pages = queries.map((query) => new URLSearchParams(query).get('pagina'));
  expect(pages.filter((value, index) => value !== pages[index - 1])).toEqual(['2', '1']);
  expect(pages.filter((value) => value === '1')).toHaveLength(1);
  await inspect(page, '1440-ultima-candidatura-decidida');
});
