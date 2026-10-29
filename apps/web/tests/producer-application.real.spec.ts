import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection, Types } from 'mongoose';
import { createUserModel } from '../../api/src/modules/users/user.model';
import { applicationPath } from '../src/features/producer-application/model';
import { applicationInput, fillApplication } from './support/producer-application-fixtures';

const api = 'http://127.0.0.1:3011/api';
let connection: ReturnType<typeof createConnection>, database: ReturnType<typeof createConnection>;
const created: Types.ObjectId[] = [];
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
  const ids = created.splice(0);
  await database.db!.collection('producers').deleteMany({ userId: { $in: ids } });
  await database.db!.collection('users').deleteMany({ _id: { $in: ids } });
});
test.afterAll(async () => {
  await connection?.close();
});
async function actor(request: APIRequestContext, administrator = false) {
  const credentials = {
    nome: 'Pessoa fictícia 7B',
    email: randomUUID() + '@example.invalid',
    password: 'Frase fictícia 7B ' + randomUUID(),
  };
  expect((await request.post(api + '/auth/register', { data: credentials })).status()).toBe(202);
  const account = await createUserModel(database)
    .findOne({ emailNormalizado: credentials.email })
    .select('+passwordHash')
    .orFail();
  created.push(account._id);
  if (administrator) {
    account.papeis = ['administrador'];
    await account.save();
  }
  const result = await request.post(api + '/auth/login', {
    data: { email: credentials.email, password: credentials.password },
  });
  expect(result.status()).toBe(200);
  return { ...credentials, id: account._id, token: (await result.json()).accessToken as string };
}
type Actor = Awaited<ReturnType<typeof actor>>;
async function login(page: Page, user: Actor) {
  await page.goto('/entrar?destino=' + encodeURIComponent(applicationPath));
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(applicationPath + '$'));
  await expect(page.getByRole('form', { name: 'Candidatura a produtor' })).toBeVisible();
}
async function submit(page: Page, again = false) {
  if (!again) await fillApplication(page);
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/me/producer-application' &&
      r.request().method() === 'POST',
  );
  await page
    .getByRole('button', {
      name: again ? 'Reapresentar candidatura' : 'Enviar candidatura',
      exact: true,
    })
    .click();
  const result = await response;
  expect(result.status()).toBe(201);
  await expect(page.getByRole('heading', { name: 'Recebemos a tua candidatura.' })).toBeVisible();
  return (await result.json()) as { id: string; estado: string; historico: unknown[] };
}
async function decision(
  request: APIRequestContext,
  admin: Actor,
  id: string,
  outcome: 'approve' | 'reject',
) {
  const headers = { Authorization: 'Bearer ' + admin.token };
  const read = await request.get(api + '/admin/producer-applications/' + id, { headers });
  expect(read.status()).toBe(200);
  const result = await request.post(api + '/admin/producer-applications/' + id + '/' + outcome, {
    headers: { ...headers, 'If-Match': read.headers().etag! },
    data:
      outcome === 'approve'
        ? {}
        : { justificacao: 'Explica melhor os produtos e a atividade agrícola.' },
  });
  expect(result.status()).toBe(200);
}
async function snapshot(page: Page, name: string) {
  const directory = process.env.DOCAMPO_APPLICATION_SCREENSHOTS;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.screenshot({
    path: join(directory, name + '.png'),
    fullPage: true,
    animations: 'disabled',
  });
}
test('React envia candidatura real; MongoDB guarda um perfil pendente sem conceder produtor', async ({
  page,
  request,
}) => {
  const user = await actor(request);
  await login(page, user);
  const application = await submit(page);
  const profile = await database
    .db!.collection('producers')
    .findOne({ _id: new Types.ObjectId(application.id) });
  expect(profile).toMatchObject({
    ...applicationInput,
    userId: user.id,
    aprovacao: { estado: 'pendente' },
  });
  expect((await createUserModel(database).findById(user.id).orFail()).papeis).toEqual([
    'comprador',
  ]);
  expect(await database.db!.collection('producers').countDocuments({ userId: user.id })).toBe(1);
  await expect(page.getByRole('form')).toHaveCount(0);
  expect(
    (
      await request.post(api + '/me/producer-application', {
        headers: { Authorization: 'Bearer ' + user.token },
        data: applicationInput,
      })
    ).status(),
  ).toBe(409);
});
test('rejeição real → reapresentação → aprovação atualiza capacidades por /auth/me sem novo login', async ({
  page,
  request,
}) => {
  const user = await actor(request),
    admin = await actor(request, true);
  await login(page, user);
  const first = await submit(page);
  await decision(request, admin, first.id, 'reject');
  await page.getByRole('button', { name: 'Atualizar estado', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Há informação a rever.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Há informação a rever.' })).toBeFocused();
  await expect(
    page.getByText('Explica melhor os produtos e a atividade agrícola.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Rever e reapresentar', exact: true }).click();
  await expect(page.locator('[name="nomePublico"]')).toBeFocused();
  await page
    .locator('[name="descricao"]')
    .fill('Descrição revista: produção hortícola fictícia e sazonal.');
  const second = await submit(page, true);
  expect(second.id).toBe(first.id);
  expect(second.historico).toHaveLength(1);
  await page.getByText('Candidaturas anteriores (1)', { exact: true }).click();
  await expect(page.locator('.application-history')).toContainText(applicationInput.descricao);
  await decision(request, admin, first.id, 'approve');
  const confirmed = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/auth/me' && r.status() === 200,
  );
  await page.getByRole('button', { name: 'Atualizar estado', exact: true }).click();
  expect((await (await confirmed).json()).papeis).toEqual(['comprador', 'produtor']);
  await expect(page.getByRole('link', { name: 'Ir para a área do produtor' })).toBeVisible();
  expect((await createUserModel(database).findById(user.id).orFail()).papeis).toEqual([
    'comprador',
    'produtor',
  ]);
  const current = await database.db!.collection('producers').findOne({ userId: user.id });
  expect(current!.historicoCandidaturas).toHaveLength(1);
  expect(current!.aprovacao.estado).toBe('aprovado');
  await page.getByRole('link', { name: 'Ir para a área do produtor' }).click();
  await expect(page).toHaveURL(/\/area\/produtor$/);
  await expect(page.locator('.account-identity')).toContainText(user.nome);
  await page.getByRole('link', { name: 'Estatuto de produtor', exact: true }).click();
  await expect(page.locator('.private-role-line strong')).toHaveText('Candidatura a produtor');
  expect(
    await page.evaluate(() =>
      [...Object.values(localStorage), ...Object.values(sessionStorage)].some((v) =>
        String(v).includes('eyJ'),
      ),
    ),
  ).toBe(false);
});
test('resposta perdida após commit real exige consulta e não duplica a candidatura', async ({
  page,
  request,
}) => {
  const user = await actor(request);
  await page.setViewportSize({ width: 320, height: 960 });
  await login(page, user);
  await fillApplication(page);
  let posts = 0;
  await page.route('**/api/me/producer-application', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    posts++;
    const result = await route.fetch();
    expect(result.status()).toBe(201);
    await route.abort();
  });
  await page.getByRole('button', { name: 'Enviar candidatura', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível confirmar a submissão');
  await expect(page.getByRole('group', { name: 'Recuperar candidatura' })).toBeFocused();
  await expect(page.getByRole('alert')).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByRole('button', { name: 'Enviar candidatura', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Confirmar estado da candidatura' }).click();
  await expect(page.getByRole('heading', { name: 'Recebemos a tua candidatura.' })).toBeVisible();
  expect(posts).toBe(1);
  expect(await database.db!.collection('producers').countDocuments({ userId: user.id })).toBe(1);
});
test('conta inativa é bloqueada pela API e o React retira a candidatura privada', async ({
  page,
  request,
}) => {
  const user = await actor(request);
  await login(page, user);
  await submit(page);
  await database
    .db!.collection('users')
    .updateOne({ _id: user.id }, { $set: { ativo: false }, $inc: { revisaoOperacional: 1 } });
  await page.getByRole('button', { name: 'Atualizar estado', exact: true }).click();
  await expect(page).toHaveURL(/\/entrar\?destino=/);
  await expect(page.locator('.application-data')).toHaveCount(0);
  expect(
    (
      await request.get(api + '/me/producer-application', {
        headers: { Authorization: 'Bearer ' + user.token },
      })
    ).status(),
  ).toBe(401);
});
test('logout e atualização da página terminam o acesso, preservando o estado apenas no servidor', async ({
  page,
  request,
}) => {
  const user = await actor(request);
  await login(page, user);
  await submit(page);
  await page.reload();
  await expect(page).toHaveURL(/\/entrar\?destino=/);
  await loginPending();
  async function loginPending() {
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByLabel('Palavra-passe', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Recebemos a tua candidatura.' })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.locator('.application-data')).toHaveCount(0);
});
for (const width of [320, 430, 768, 1024, 1280, 1440])
  test(`formulário e quatro estados reais responsivos a ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 960 });
    const user = await actor(request),
      admin = await actor(request, true);
    await login(page, user);
    await fillApplication(page);
    async function inspect(name: string) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      for (const box of await page
        .locator(
          '.producer-application input,.producer-application textarea,.producer-application button',
        )
        .evaluateAll((elements) =>
          elements
            .filter((el) => el.getClientRects().length)
            .map((el) => ({
              left: el.getBoundingClientRect().left,
              right: el.getBoundingClientRect().right,
              width: el.getBoundingClientRect().width,
            })),
        )) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width + 1);
        expect(box.width).toBeGreaterThan(80);
      }
      await snapshot(page, `${width}-${name}`);
    }
    await inspect('formulario');
    const first = await submit(page);
    await inspect('pendente');
    await decision(request, admin, first.id, 'reject');
    await page.getByRole('button', { name: 'Atualizar estado', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reapresentar candidatura' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Há informação a rever.' })).toBeFocused();
    await expect(page.locator('.application-decision')).toContainText('Explica melhor');
    await expect(page.locator('.application-content details').first()).not.toHaveAttribute('open');
    await expect(page.locator('.application-process details')).not.toHaveAttribute('open');
    await inspect('rejeitada');
    await page.getByRole('button', { name: 'Rever e reapresentar', exact: true }).click();
    await expect(page.locator('[name="nomePublico"]')).toBeFocused();
    for (const [name, value] of Object.entries(applicationInput))
      await expect(page.locator(`[name="${name}"]`)).toHaveValue(value);
    const second = await submit(page, true);
    expect(second.id).toBe(first.id);
    await decision(request, admin, first.id, 'approve');
    await page.getByRole('button', { name: 'Atualizar estado', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Ir para a área do produtor' })).toBeVisible();
    await inspect('aprovada');
  });
