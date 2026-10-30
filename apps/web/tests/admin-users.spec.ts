import { test, expect } from './support/test';
import { mockAdminUsers } from './support/admin-user-fixtures';
import { fixtureUser } from './support/auth-fixtures';
const path = '/area/administrador/utilizadores';
async function navigate(page: import('@playwright/test').Page, to = path) {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
  }, to);
}
async function start(page: import('@playwright/test').Page, count = 1) {
  const fixture = await mockAdminUsers(page, count);
  await fixture.login();
  return fixture;
}
async function detail(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Gerir utilizadores', exact: true }).click();
  await page
    .getByRole('link', { name: /Consultar conta/ })
    .first()
    .click();
  await expect(page.getByRole('form', { name: 'Alterar estado da conta' })).toBeVisible();
}
test('dashboard real consulta indicadores sem inventar receitas e permite atualizar', async ({
  page,
}) => {
  const { api } = await start(page, 13);
  await expect(page.getByRole('definition').filter({ hasText: /^14$/ })).toBeVisible();
  await expect(
    page.getByText('O mercado ainda não tem produtos publicados, encomendas ou leilões ativos.'),
  ).toBeVisible();
  api.users.pop();
  await page.getByRole('button', { name: 'Atualizar indicadores' }).click();
  await expect(page.getByRole('definition').filter({ hasText: /^13$/ })).toBeVisible();
});
test('pesquisa filtros e paginação usam a query completa e corrigem página inexistente', async ({
  page,
}) => {
  const { api } = await start(page, 13);
  await navigate(page, path + '?pagina=1000&estado=ativo');
  await expect(page).toHaveURL(/pagina=2.*estado=ativo/);
  await expect(page.locator('.admin-user-cards article')).toHaveCount(1);
  await page.getByLabel('Nome ou email', { exact: true }).fill('pessoa1@');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await expect(page.locator('.admin-user-cards article')).toHaveCount(1);
  await expect.poll(() => api.queries.at(-1)).toContain('pesquisa=pessoa1%40');
  await expect(
    page.getByRole('status').filter({ hasText: '1 utilizador nesta consulta.' }),
  ).toBeVisible();
  await page.getByLabel('Estado da conta', { exact: true }).selectOption('inativo');
  await expect(
    page.getByRole('heading', { name: 'Nenhum utilizador corresponde à consulta.' }),
  ).toBeVisible();
});
test('loading e erro não são apresentados como métricas zero', async ({ page }) => {
  const f = await mockAdminUsers(page);
  let release!: () => void;
  f.api.gate = new Promise((r) => (release = r));
  await f.login();
  await expect(page.getByRole('status', { name: 'A consultar indicadores reais' })).toBeVisible();
  await expect(page.locator('.admin-real-metrics')).toHaveCount(0);
  f.api.status = 503;
  release();
  await expect(
    page.getByRole('group', { name: 'Recuperar consulta administrativa' }),
  ).toBeFocused();
  await expect(page.getByRole('alert')).not.toContainText('segredo');
  f.api.status = 0;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.locator('.admin-real-metrics')).toBeVisible();
});
test('motivo confirmação foco e envio exclusivo protegem desativação e auditoria', async ({
  page,
}) => {
  const { api } = await start(page);
  await detail(page);
  await page.getByRole('button', { name: 'Desativar conta', exact: true }).click();
  const field = page.getByLabel('Motivo da alteração', { exact: true });
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(api.posts).toHaveLength(0);
  await field.fill('  Revisão fictícia.  ');
  await page.getByRole('button', { name: 'Desativar conta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continuar análise' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Confirmar desativação' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('region', { name: 'Motivo da alteração a confirmar' })).toBeFocused();
  let release!: () => void;
  api.postGate = new Promise((r) => (release = r));
  await page.getByRole('button', { name: 'Confirmar desativação' }).click();
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
  expect(api.posts).toHaveLength(1);
  release();
  await expect(page.locator('#admin-user-title')).toBeFocused();
  await expect(
    page.getByRole('status').filter({ hasText: 'A desativação foi confirmada' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reativar conta', exact: true })).toBeVisible();
  await expect(page.locator('.admin-account-audit')).toContainText('Revisão fictícia.');
  expect(api.posts[0]!.body).toEqual({ ativo: false, motivo: 'Revisão fictícia.' });
});
test('conflito 412 bloqueia nova alteração até consulta explícita', async ({ page }) => {
  const { api } = await start(page);
  await detail(page);
  api.postStatus = 412;
  await page.getByLabel('Motivo da alteração', { exact: true }).fill('Motivo fictício.');
  await page.getByRole('button', { name: 'Desativar conta', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar desativação' }).click();
  await expect(page.getByRole('group', { name: 'Recuperar alteração da conta' })).toBeFocused();
  await expect(page.getByRole('alert')).toContainText('A tua alteração não foi confirmada');
  await expect(page.getByRole('form', { name: 'Alterar estado da conta' })).toHaveCount(0);
  expect(api.posts).toHaveLength(1);
  await page.getByRole('button', { name: 'Consultar estado atualizado' }).click();
  await expect(page.getByRole('button', { name: 'Reativar conta', exact: true })).toBeVisible();
});
test('self não oferece desativação e identidade/roles nunca são alterados pelo formulário', async ({
  page,
}) => {
  const { api } = await start(page);
  api.users[0]!.id = fixtureUser.id;
  api.users[0]!.papeis = ['administrador'];
  api.users[0]!.capacidades = { comprar: false, vender: false, administrar: true };
  await navigate(page, path + '/' + fixtureUser.id);
  await expect(page.getByText('A autodesativação está bloqueada.', { exact: false })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Alterar estado da conta' })).toHaveCount(0);
});
for (const role of ['comprador', 'produtor'] as const)
  test(role + ' não consulta administração', async ({ page }) => {
    const f = await mockAdminUsers(page);
    f.auth.roles = [role];
    await f.login();
    await navigate(page, path);
    await expect(page.getByRole('heading', { name: 'Não tens acesso a esta área.' })).toBeVisible();
    expect(f.api.queries).toHaveLength(0);
    expect(f.api.posts).toHaveLength(0);
  });
test('403 remove detalhe e confirmar permissões não entra em ciclo', async ({ page }) => {
  const { api, auth } = await start(page);
  await detail(page);
  await page.getByLabel('Motivo da alteração', { exact: true }).fill('Nota privada.');
  api.status = 403;
  await page.getByRole('button', { name: 'Atualizar conta' }).click();
  await expect(page.getByRole('alert')).toContainText('não tem acesso administrativo');
  await expect(page.locator('.application-data')).toHaveCount(0);
  auth.roles = ['comprador'];
  await page.getByRole('button', { name: 'Confirmar acesso administrativo' }).click();
  await expect(page.getByRole('heading', { name: 'Não tens acesso a esta área.' })).toBeVisible();
});
